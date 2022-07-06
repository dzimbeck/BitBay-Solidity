// SPDX-License-Identifier: GPL-3.0
pragma solidity = 0.8.4; //Required to hand memory safe decoding of arrays

interface ILiquidityPool {
    function LPbalance(address) external returns (address, address, address);
    function deposit(address,address,uint256[38] memory,uint256) external;
    function deposit2(address,address,uint256[] memory,uint256) external;
    function withdrawLP(address,address,uint256) external returns (uint256[38] memory);
    function withdrawBuy(address,uint256[38] memory,uint256) external;    
    function calculateBalance(address,address,bool,uint256) external view returns (uint256, uint256, uint256[38] memory);
    function poolhighkey(address) external pure returns (uint256);
}

interface IMinter {
    function burn(address,uint256[38] memory,uint256) external;
    function burn2(address,uint256[] memory,uint256) external;
}

contract BITBAY {
    string public constant name = "BitBay Data";
    string public version = "1";
    uint public totalSupply;
    
    // The keyword "public" makes variables
    // accessible from other contracts
    address public minter;
    uint pegrate;
    uint deflationrate;
    uint pegsteps;
    uint intervaltime;
    uint currentSupply;
    uint maxchange;
    uint reservetimelock;
    uint changefrequency;
    uint microsteps;
    bool lock;
    
    //Governance
    bool active = true;
    bool specialEnabled = false;
    bool automaticUnfreeze = true;
    uint frozenslots = 4; //amount of concurrent frozen TX allowed
    
    //User balances are actually arrays, include peg steps here and in constructor
    mapping (address => uint[38]) public Rbalances; //Steps + microsteps
    
    mapping (address => uint) public highkey; //microshard section since last update
    mapping (address => mapping (address => uint)) private allowed;
    mapping (address => mapping (address => uint)) private allowedReserve;
    
    address[] public proxyContracts; //The tokens and other internal contracts
    mapping (address => bool) public isProxy;    

    address public LiquidityPool;
    address[] public myRouters;
    mapping (address => uint) public isAMM;
    mapping (address => bool) public isRouter;
    mapping (address => uint[2]) routerVars;
    mapping (address => address) mintTo;
    mapping (address => address) public withdrawAddy;

    // Events allow clients to react to specific
    // contract changes you declare
    event Approval(address from, address to, uint amount);
    event ApprovalReserve(address from, address to, uint amount);
    event Transfer(address from, address to, uint amount);
    event TransferReserve(address from, address to, uint amount);
    
    //Safe math functions
    function mulDiv(uint x, uint y, uint z) internal pure returns (uint) {
      uint a = x / z; uint b = x % z; // x = a * z + b
      uint c = y / z; uint d = y % z; // y = c * z + d
      return a * b * z + a * d + b * c + b * d / z;
    }
    function add(uint x, uint y) internal pure returns (uint z) {
        require((z = x + y) >= x, 'ds-math-add-overflow');
    }
    function sub(uint x, uint y) internal pure returns (uint z) {
        require((z = x - y) <= x, 'ds-math-sub-underflow');
    }
    function mul(uint x, uint y) internal pure returns (uint z) {
        require(y == 0 || (z = x * y) / y == x, 'ds-math-mul-overflow');
    }
    
    // Constructor code is only run when the contract is created
    constructor() {
        minter = msg.sender;
        pegrate = 95;//5 times deflation rate compound
        pegsteps = 30;//With microsteps total supplies is 30 * 5 (or 30 * 5 * 8 converted to BitBay)
        deflationrate = 99;//100-deflationrate is the percent of deflation for BitBay
        microsteps = 8; //25-12-4,30-5-8,30-10-4 (different factor combinations have varied smoothness and costs)
        intervaltime = block.timestamp;
        currentSupply = 0;
        maxchange = 40;
        reservetimelock = 600; //10 minutes for testing, BitBay's actual delay is one month
        changefrequency = 120; //2 minutes for testing
        totalSupply = 1e17;
    }
    
    //Users need to separate frozen coins until they unlock
    //Solidity has limited support for nested arrays or structs or multidimensional return values. So we need several variables for frozen funds
    mapping (address => uint[30][4]) public FrozenTXDB;
    mapping (address => uint[2][4]) public FrozenTXDBTimeSpent;
    mapping (address => uint) public recenttimestamp;
    mapping (address => uint) public unspentslots;
    
    //This is the administration contract for decentralized community management
    function changeMinter(address newminter) public {
        require(msg.sender == minter);
        minter = newminter;
    }

    function changeLiquidityPool(address newpool) public {
        require(msg.sender == minter);
        LiquidityPool = newpool;
    }

    function changeRouter(address router, bool status) public {
        require(msg.sender == minter);
        isRouter[router] = status;
        myRouters.push(router);
    }

    function changeVars(uint lvar, uint rvar, address sender, address pair, address to) external returns (bool) {
        require(isRouter[msg.sender]);
        if(pair == address(0)) {
            routerVars[msg.sender][0] = lvar;
            routerVars[msg.sender][1] = rvar;
            mintTo[msg.sender] = sender;
        } else {
            withdrawAddy[pair] = sender;
            mintTo[pair] = to;
            routerVars[pair][0] = lvar;
        }
        return true;
    }

    //These are the proxy contracts for BAYL,BAYR,Frozen,etc
    function changeProxy(address theproxy, bool status) public {
        require(msg.sender == minter);
        isProxy[theproxy] = status;
        proxyContracts.push(theproxy); //Useful for quick lookup
    }

    function setActive(bool status) public {
        require(msg.sender == minter);
        active = status;
    }

    function enableSpecial(bool status) public {
        require(msg.sender == minter);
        specialEnabled = status;
    }

    function setAutomaticUnfreeze(bool status) public {
        require(msg.sender == minter);
        automaticUnfreeze = status;
    }

    function getState() public view returns (uint, uint, uint, uint, uint){
        return (currentSupply, pegsteps, microsteps, pegrate, deflationrate);
    }

    // Sends an amount of newly created coins to an address, used for the BAY bridge
    // Can only be called by the contract creator
    function mint(address receiver, uint[38] memory reserve) public returns (bool){
        require(active);
        require(msg.sender == minter || isRouter[msg.sender]);
        calcLocals memory a;
        uint[38] memory reserve2;
        if(isRouter[msg.sender]) {
            (,, reserve2) = calculateBalance(msg.sender, 0);
        }
        (a.liquid, a.rval, a.reserve) = calculateBalance(receiver, 0);
        a.supply = currentSupply;
        a.pegsteps = pegsteps;
        a.mk = microsteps;
        a.section = a.supply / a.mk;
        a.i = 0;
        a.j = 0;
        a.k = a.supply % a.mk;
        uint amount;
        amount = 0;
        while (a.i < a.pegsteps) {
            if (a.i == a.section) {
                while (a.j < a.mk) {
                    require(reserve[a.pegsteps + a.j] >= 0);
                    amount = add(amount, reserve[a.pegsteps + a.j]);
                    a.reserve[a.pegsteps + a.j] = add(a.reserve[a.pegsteps + a.j], reserve[a.pegsteps + a.j]); //We consolidate to the supply index
                    if(isRouter[msg.sender]) {
                        reserve2[a.pegsteps + a.j] = sub(reserve2[a.pegsteps + a.j], reserve[a.pegsteps + a.j]);
                    }
                    a.j += 1;
                }
            }
            else {
                require(reserve[a.i] >= 0);
                amount = add(amount, reserve[a.i]);
                a.reserve[a.i] = add(a.reserve[a.i], reserve[a.i]);
                if(isRouter[msg.sender]) {
                    reserve2[a.i] = sub(reserve2[a.i], reserve[a.i]);
                }
            }
            a.i += 1;
        }
        require(amount <= totalSupply);
        if(isRouter[msg.sender]) {
            Rbalances[msg.sender] = reserve2;
            highkey[msg.sender] = a.section;
        }
        Rbalances[receiver] =  a.reserve;
        //highkey tells us the microshard section we are currently in
        highkey[receiver] = a.section;
        emit Transfer(minter, receiver, amount);
        return true;
    }

    //Increase or decrease the total system supply changing each users ratio of liquid and reserve coins based on their arrays
    function setSupply(uint x) public {
        //Total supplies is peg steps 
        require(msg.sender == minter);
        require(x >= 0);
        require(x < (pegsteps * microsteps));
        if (x > currentSupply) {
            require(x - currentSupply <= maxchange); //"Change in supply is too large."
        }
        if (x < currentSupply) {
            require(currentSupply - x <= maxchange); //"Change in supply is too large."
        }
        require(intervaltime + changefrequency < block.timestamp);//Change in supply is too frequent
        intervaltime = block.timestamp;
        currentSupply = x;
    }
    
    //Gets the liquid/reserve supply index.
    function getSupply() public view returns (uint) {
        return currentSupply;
    }

    //Unfortunately solidity limits the number of variables to a function so a struct is used here
    struct calcLocals {
        uint[38] reserve;
        uint highkey;
        uint supply;
        uint section;
        uint mk;
        uint pegsteps;
        uint pegrate;
        uint i;
        uint rval;
        uint liquid;
        uint newtot;
        uint k;
        uint j;
    }
    struct othervars {
        uint AMMstatus;
        address sender2;
        uint rval;
        uint mysize;
    }
    
    //ERC20 Functions
    function balanceOf(address user) public view returns (uint) {
        uint liquid;
        uint rval;
        uint[38] memory reserve;
        if (isAMM[user] == 1) {
            (liquid, rval, reserve) = ILiquidityPool(LiquidityPool).calculateBalance(user,user,true,9999);
        } else {
            (liquid, rval, reserve) = calculateBalance(user, 0);
        }
        return liquid;
    }
    
    function reserveBalanceOf(address user) public view returns (uint) {
        uint liquid;
        uint rval;
        uint[38] memory reserve;
        if (isAMM[user] == 1) {
            (liquid, rval, reserve) = ILiquidityPool(LiquidityPool).calculateBalance(user,user,true,9999);
        } else {
            (liquid, rval, reserve) = calculateBalance(user, 0);
        }
        return rval;
    }
    
    function allowance(address owner, address spender) public view returns (uint) {
        return allowed[owner][spender];
    }
    
    function allowanceReserve(address owner, address spender) public view returns (uint) {
        return allowedReserve[owner][spender];
    }
    
    //Allowances should be reset to zero before changing them. Otherwise you can use increase or decrease functions.
    function approve(address spender, uint value, address proxyaddy) public returns (bool) {
        require(active);
        require(spender != address(0));
        address sender;
        sender = msg.sender;
        if (isProxy[msg.sender]) {
            sender = proxyaddy;
        }
        allowed[sender][spender] = value;
        emit Approval(sender, spender, value);
        return true;
    }
    
    function approveReserve(address spender, uint value, address proxyaddy) public returns (bool) {
        require(active);
        require(spender != address(0));
        address sender;
        sender = msg.sender;
        if (isProxy[msg.sender]) {
            sender = proxyaddy;
        }
        allowedReserve[sender][spender] = value;
        emit ApprovalReserve(sender, spender, value);
        return true;
    }

    function increaseAllowance(address spender, uint value, address proxyaddy) public returns (bool) {
        require(active);
        require(spender != address(0));
        address sender;
        sender = msg.sender;
        if (isProxy[msg.sender]) {
            sender = proxyaddy;
        }
        allowed[sender][spender] = add(allowed[sender][spender], value);
        emit Approval(sender, spender, allowed[sender][spender]);
        return true;
    }
    
    function decreaseAllowance(address spender, uint value, address proxyaddy) public returns (bool) {
        require(active);
        require(spender != address(0));
        address sender;
        sender = msg.sender;
        if (isProxy[msg.sender]) {
            sender = proxyaddy;
        }
        allowed[sender][spender] = sub(allowed[sender][spender], value);
        emit Approval(sender, spender, allowed[sender][spender]);
        return true;
    }
    
    function increaseAllowanceReserve(address spender, uint value, address proxyaddy) public returns (bool) {
        require(active);
        require(spender != address(0));
        address sender;
        sender = msg.sender;
        if (isProxy[msg.sender]) {
            sender = proxyaddy;
        }
        allowedReserve[sender][spender] = add(allowedReserve[sender][spender], value);
        emit ApprovalReserve(sender, spender, allowedReserve[sender][spender]);
        return true;
    }
    
    function decreaseAllowanceReserve(address spender, uint value, address proxyaddy) public returns (bool) {
        require(active);
        require(spender != address(0));
        address sender;
        sender = msg.sender;
        if (isProxy[msg.sender]) {
            sender = proxyaddy;
        }
        allowedReserve[sender][spender] = sub(allowedReserve[sender][spender], value);
        emit ApprovalReserve(sender, spender, allowedReserve[sender][spender]);
        return true;
    }
    
    function transfer(address to, uint value, address proxyaddy) public returns (bool) {
        return sendLiquid(msg.sender, to, value, proxyaddy);
    }
    
    function transferFrom(address from, address to, uint value, address proxyaddy) public returns (bool) {
        return sendLiquid(from, to, value, proxyaddy);
    }
    
    function transferReserve(address to, uint value, address proxyaddy) public returns (bool) {
        uint[] memory a;
        return sendReserve(msg.sender, to, value, a, 0, proxyaddy);
    }
    
    function transferReserveFrom(address from, address to, uint value, address proxyaddy) public returns (bool) {
        uint[] memory a;
        return sendReserve(from, to, value, a, 0, proxyaddy);
    }

    function getFrozen(address user) public view returns (uint[30][4] memory) {
        return FrozenTXDB[user];
    }

    //IMPORTANT: You can find out what your balance will be at any supply by passing an optional variable to this function.
    //This information is good to know in order to determine a buffer. Buffers are useful for situations where reorganizations effect certain agreements
    //arranged in advance. It's also useful for private contracts and just generally predicting how fast your account will deflate.
    function calculateBalance(address user, uint buffer) public view returns (uint, uint, uint[38] memory) {
        calcLocals memory a;
        a.reserve = Rbalances[user];
        a.highkey = highkey[user];
        a.supply = currentSupply;
        if (buffer != 0) {
            //To check supply at 0 just add liquid + reserve balances
            a.supply = buffer;
        }
        a.mk = microsteps;
        a.section = (a.supply / a.mk);
        a.pegsteps = pegsteps;
        a.pegrate = pegrate;
        a.i = 0;
        a.rval = 0;
        a.liquid = 0;
        a.k = a.supply % a.mk;
        
        if (a.section != a.highkey) { //Supply has changed sections, condense/distribute microshards
            a.newtot = 0;
            while (a.i < a.mk) {
                a.newtot += a.reserve[a.pegsteps + a.i];
                a.reserve[a.pegsteps + a.i] = 0;
                a.i += 1;
            }
            a.reserve[a.highkey] = a.newtot;
            if (a.reserve[a.section] != 0) {
                a.i = 0;
                a.newtot = a.reserve[a.section];
                a.reserve[a.section] = 0;
                //It's okay to divide microshards evenly because liquid/reserve ratios don't precisely convert between networks on the bridge either way
                //This is because BAY network has many more shards and the microshards system is done to save in storage costs
                a.liquid = a.newtot / a.mk;
                while (a.i < a.mk - 1) {                    
                    a.newtot -= a.liquid;
                    a.reserve[a.pegsteps + a.i] += a.liquid;
                    a.i += 1;
                }
                a.reserve[a.pegsteps + a.i] += a.newtot; //Last section gets whatever is left over
            }
            a.liquid = 0;
        }
        
        a.i = 0;
        while (a.i < a.pegsteps) {
            if (a.i < a.section) {
                a.rval += a.reserve[a.i];
            }
            if (a.i > a.section) {
                a.liquid += a.reserve[a.i];
            }
            a.i += 1;
        }
        a.i = 0;
        while (a.i < a.mk) {
            if (a.i < a.k) {
                a.rval += a.reserve[a.pegsteps + a.i];
            }
            if (a.i >= a.k) {
                a.liquid += a.reserve[a.pegsteps + a.i];
            }
            a.i += 1;
        }
        return (a.liquid, a.rval, a.reserve);
    }

    function isAMMExchange(address AMM) private returns (bool) {
        bool success;
        bytes memory result;
        if (AMM.code.length == 0) {
            return false;
        }
        if (isAMM[AMM] > 0) {
            if (isAMM[AMM] == 1) {
                ILiquidityPool(LiquidityPool).LPbalance(AMM);
                return true;
            } else {
                return false;
            }
        }        
        address[3] memory myaddy;
        //This is like a try/catch to detect an AMM pair.
        (success, result) = LiquidityPool.call(abi.encodeWithSignature("checkAMM(address)",AMM));
        if (success) {
            (myaddy[0], myaddy[1], myaddy[2]) = abi.decode(result, (address,address,address));
            if (isProxy[myaddy[0]] && isProxy[myaddy[1]]) {
                require(false); //Can not pair BAY against BAYR in a traditional AMM
            } else {
                if (isProxy[myaddy[0]] || isProxy[myaddy[1]]) {
                    isAMM[AMM] = 1;
                    return true;
                }
            }            
        }
        isAMM[AMM] = 2;
        return false;
    }
    
    //Sends liquid coins and recalculates balances of sender and recipient and sends liquid funds
    function sendLiquid(address sender, address receiver, uint amount, address proxyaddy) public returns (bool) {
        require(!lock); //Since calls are used here, we should protect everything against re-entry
        lock = true;
        //IMPORTANT: Always reserve enough gas to update your balance in case of peg and balance changes
        require(active);
        require(amount > 0); //"No funds sent."
        require(receiver != address(0));
        calcLocals memory a;
        othervars memory b;
        b.sender2 = msg.sender;
        if (isProxy[msg.sender]) {
            b.sender2 = proxyaddy;
        }
        if (sender != b.sender2) {
            require(amount <= allowed[sender][b.sender2]);
            allowed[sender][b.sender2] = sub(allowed[sender][b.sender2], amount);
        }
        if (automaticUnfreeze) {
            ReleaseFrozenFunds(sender);
        }
        a.supply = currentSupply;
        a.pegsteps = pegsteps;
        a.mk = microsteps;
        a.section = a.supply / a.mk;
        if (isAMMExchange(sender)) {
            b.AMMstatus = 1;
            a.i = ILiquidityPool(LiquidityPool).poolhighkey(sender);
            require(a.i == a.section); //"Please synchronize the balance of this pair before proceeding."
        }
        if (isAMMExchange(receiver)) {
            require(b.AMMstatus == 0); //"Please do not transfer directly from one AMM to another."
            b.AMMstatus = 2;
            a.i = ILiquidityPool(LiquidityPool).poolhighkey(receiver);
            require(a.i == a.section); //"Please synchronize the balance of this pair before proceeding."
        }
        uint liquid;
        uint[38] memory reserve;
        uint[38] memory reserve2;
        if (b.AMMstatus == 1) { //We have detected the user might be withdrawing from an AMM
            if(withdrawAddy[sender] == address(0)) { //They are just buying
                (liquid, a.rval, reserve) = ILiquidityPool(LiquidityPool).calculateBalance(sender,sender,true,0);
            } else { //This is a withdraw
                (reserve) = ILiquidityPool(LiquidityPool).withdrawLP(sender,withdrawAddy[sender],routerVars[sender][0]);                
                (,, reserve2) = calculateBalance(mintTo[sender], 0);
                a.i = 0;
                //If you want to freeze reserve have the withdraw go to an intermediary address like the router
                while(a.i < pegsteps + a.mk) {
                    reserve2[a.i] += reserve[a.i];
                    a.newtot += reserve[a.i];
                    a.i += 1;
                }
                Rbalances[mintTo[sender]] = reserve2;
                highkey[mintTo[sender]] = a.section;
                emit Transfer(sender, mintTo[sender], a.newtot);
                mintTo[sender] = address(0);  
                withdrawAddy[sender] = address(0);              
                routerVars[sender][0] = 0;                
                lock = false;
                return true;
            }
        } else {
            (liquid, a.rval, reserve) = calculateBalance(sender, 0);
        }
        require(amount <= liquid); //"Insufficient liquid balance."
        if (sender == receiver) {
            Rbalances[sender] = reserve;
            highkey[sender] = a.section; //They essentially paid to update their balance
            lock = false;
            return true;
        }
        if (automaticUnfreeze) {
            ReleaseFrozenFunds(receiver);
        }
        if (b.AMMstatus != 2) { //reveiver is not an AMM
            if(receiver != minter) {
                (,, reserve2) = calculateBalance(receiver, 0);
            }
        } else { //Deposit detected
            require(routerVars[b.sender2][0] != 0); //"Deposits to this AMM must be made from the BitBay router"
        }
        a.i = 0;
        a.k = a.supply % a.mk;
        a.liquid = 0;
        a.newtot = 0;
        while (a.i < a.mk - a.k) {
            a.liquid = mul(reserve[a.pegsteps + a.k + a.i],amount) / liquid;
            reserve[a.pegsteps + a.k + a.i] -= a.liquid;
            reserve2[a.pegsteps + a.k + a.i] += a.liquid;
            a.newtot += a.liquid;
            a.i += 1;
        }
        a.i = a.section + 1;
        while (a.i < a.pegsteps) {
            a.liquid = mul(reserve[a.i],amount) / liquid;
            reserve[a.i] -= a.liquid;
            reserve2[a.i] += a.liquid;
            a.newtot += a.liquid;
            a.i += 1;
        }
        uint remainder = sub(amount, a.newtot);
        a.i = 0;
        while (a.i < a.mk - a.k) {
            if (remainder == 0) {
                break;
            }
            if (reserve[a.pegsteps + a.k + a.i] > 0) {
                reserve[a.pegsteps + a.k + a.i] -= 1;
                reserve2[a.pegsteps + a.k + a.i] += 1;
                remainder -= 1;
                a.newtot += 1;
            }
            a.i += 1;
        }
        a.i = a.section + 1;
        while (a.i < a.pegsteps) {
            if (remainder == 0) {
                break;
            }
            if (reserve[a.i] > 0) {
                reserve[a.i] -= 1;
                reserve2[a.i] += 1;
                remainder -= 1;
                a.newtot += 1;
            }
            a.i += 1;
        }
        require(remainder == 0); //"Calculation error"
        if (b.AMMstatus == 2) { //We have detected the user might be depositing to an AMM
            if (routerVars[b.sender2][0] == 1) { //Deposit to a specific user
                ILiquidityPool(LiquidityPool).deposit(mintTo[b.sender2],receiver,reserve2,0);
            } else { //Trade and send funds to the pool
                ILiquidityPool(LiquidityPool).deposit(sender,receiver,reserve2,1);
            }
            if(routerVars[b.sender2][1] == 0) { //Check to see if reserve deposit is pending
                mintTo[b.sender2] = address(0);
            }
            routerVars[b.sender2][0] = 0;
        } else {
            if(receiver == minter) {
                IMinter(minter).burn(sender,reserve2,a.section);
            } else {
                Rbalances[receiver] =  reserve2;
                highkey[receiver] = a.section; //highkey tells us the microshard section we are currently in
            }
        }
        if (b.AMMstatus == 1) { //We have detected the user might be buying from an AMM
            ILiquidityPool(LiquidityPool).withdrawBuy(sender,reserve,a.section);
        } else {
            Rbalances[sender] = reserve;
            highkey[sender] = a.section; //highkey tells us the microshard section we are currently in
        }        
        emit Transfer(sender, receiver, a.newtot);//A recipient will want to wait enough transactions to avoid a reorganization if the sender is too close to supply change
        lock = false;
        return true;
    }
    
    // Sends reserve coins and recalculates balances of sender and gives the recipient a timelocked payment.
    function sendReserve(address sender, address receiver, uint amount, uint[] memory specialtx, uint sendspecial, address proxyaddy) public returns (bool) {
        require(!lock);
        lock = true;
        require(active);
        require(receiver != address(0));
        calcLocals memory a;
        othervars memory b;
        b.sender2 = msg.sender;
        if (isProxy[msg.sender]) {
            b.sender2 = proxyaddy;
        }       
        if (sender != b.sender2) {
            require(amount <= allowedReserve[sender][b.sender2]);
            allowedReserve[sender][b.sender2] = sub(allowedReserve[sender][b.sender2], amount);
        }
        //Balance will recalculate. Be careful to predict which reserve coins might become liquid on peg change so TX goes through
        if (automaticUnfreeze) {
            ReleaseFrozenFunds(sender);
        }
        if (automaticUnfreeze) {
            ReleaseFrozenFunds(receiver);
        }
        //Unless an exchange has a special orderbook where people buy specific reserve coins, then it's best
        //to let the users exchange their full range of reserve. However maybe some exchanges will let users sell
        //reserve in different ranges similar to a futures market. There is lot's of great possibilities here.        
        a.supply = currentSupply;
        a.mk =  microsteps;
        a.section = a.supply / a.mk;
        a.pegsteps = pegsteps;        
        a.j = 0;
        a.k = a.supply % a.mk;
        a.newtot = 0;
        b.mysize = a.pegsteps;   
        if (isAMMExchange(sender)) {
            b.AMMstatus = 1;
            a.i = ILiquidityPool(LiquidityPool).poolhighkey(sender);
            require(a.i == a.section); //"Please synchronize the balance of this pair before proceeding."
        }
        if (isAMMExchange(receiver)) {           
            require(b.AMMstatus == 0); //"Please do not transfer directly from one AMM to another."
            b.AMMstatus = 2;
            a.i = ILiquidityPool(LiquidityPool).poolhighkey(receiver);
            require(a.i == a.section); //"Please synchronize the balance of this pair before proceeding."
            b.mysize += a.mk;
        }
        if (isRouter[receiver] && b.AMMstatus == 0) {
            b.mysize += a.mk;
        }
        if (receiver == minter && b.mysize == a.pegsteps) {
            b.mysize += a.mk;
        }
        a.i = 0;
        uint[38] memory reserve;
        if (b.AMMstatus == 1) { //We have detected the user might be withdrawing from an AMM
            if(withdrawAddy[sender] == address(0)) { //They are just buying
                (a.liquid, b.rval, reserve) = ILiquidityPool(LiquidityPool).calculateBalance(sender,sender,true,0);
                if(isRouter[receiver] && b.mysize == a.pegsteps) { //Don't freeze funds at a router
                    b.mysize += a.mk;
                }
            } else { //Withdraw
                (reserve) = ILiquidityPool(LiquidityPool).withdrawLP(sender,withdrawAddy[sender],routerVars[sender][0]);
                (a.liquid, a.rval, a.reserve) = calculateBalance(mintTo[sender], 0);                
                //If you want to freeze reserve have the withdraw go to an intermediary address like the router
                while(a.i < pegsteps + a.mk) {
                    a.reserve[a.i] += reserve[a.i];
                    a.newtot += reserve[a.i];
                    a.i += 1;
                }
                Rbalances[mintTo[sender]] = a.reserve;
                highkey[mintTo[sender]] = a.section;
                emit TransferReserve(sender, mintTo[sender], a.newtot);
                mintTo[sender] = address(0);  
                withdrawAddy[sender] = address(0);              
                routerVars[sender][0] = 0;
                lock = false;
                return true;
            }
        } else {
            (a.liquid, b.rval, reserve) = calculateBalance(sender, 0);
        }
        uint[] memory reserve2 = new uint[](b.mysize);
        if (sendspecial > 0) {
            require(specialEnabled); //"Special reserve TX disabled"
            require(a.section == (sendspecial - 1)); //User should ensure the correct section is sent
            a.newtot = amount;
            amount = 0;
            while (a.i < a.pegsteps) {
                if (a.i > a.section) {
                    break;
                }
                if (a.i == a.section) {
                    while (a.j < a.mk) {
                        if (a.j == a.k) {
                            break;
                        }
                        require(specialtx[a.pegsteps + a.j] >= 0); //"Negative value passed"
                        require(specialtx[a.pegsteps + a.j] <= reserve[a.pegsteps + a.j]); //"Index does not contain enough micro-reserve!"
                        amount = add(amount, specialtx[a.pegsteps + a.j]);
                        if(b.mysize != a.pegsteps) {
                            reserve2[a.pegsteps + a.j] = add(reserve2[a.pegsteps + a.j], specialtx[a.pegsteps + a.j]);
                        } else {
                            reserve2[a.i] = add(reserve2[a.i], specialtx[a.pegsteps + a.j]); //We consolidate to the supply index
                        }
                        reserve[a.pegsteps + a.j] = sub(reserve[a.pegsteps + a.j], specialtx[a.pegsteps + a.j]);
                        a.j += 1;
                    }
                    break;
                }
                if (a.i < a.section) {
                    require(specialtx[a.i] >= 0); //"Negative value passed"
                    require(specialtx[a.i] <= reserve[a.i]); //"Index does not contain enough reserve!"
                    amount = add(amount, specialtx[a.i]);
                    reserve2[a.i] = add(reserve2[a.i], specialtx[a.i]);
                    reserve[a.i] = sub(reserve[a.i], specialtx[a.i]);
                }
                a.i += 1;
            }
            //Reorganization or incorrect value may cause part of the array to not get sent.
            //Therefore, we make certain the desired amount was sent.
            require(a.newtot == amount); //"Desired amount not sent"
            require(amount <= b.rval); //"Insufficient reserve balance."
        }
        require(amount > 0); //"No funds sent"
        if (sendspecial == 0) {
            require(amount <= b.rval); //"Insufficient reserve balance."
            uint propval = 0;
            while (a.i < a.pegsteps) {
                if (a.i > a.section) {
                    break;
                }
                if (a.i == a.section) {
                    while (a.j < a.mk) {
                        if (a.j == a.k) {
                            break;
                        }
                        propval = mul(amount, reserve[a.pegsteps + a.j]) / b.rval;
                        if(b.mysize != a.pegsteps) {
                            reserve2[a.pegsteps + a.j] += propval;
                        } else {
                            reserve2[a.i] += propval; //We consolidate to the supply index
                        }
                        reserve[a.pegsteps + a.j] -= propval;
                        a.newtot += propval;
                        a.j += 1;
                    }
                    break;
                }
                if (a.i < a.section) {
                    propval = mul(amount, reserve[a.i]) / b.rval;
                    reserve2[a.i] += propval;
                    reserve[a.i] -= propval;
                    a.newtot += propval;
                }
                a.i += 1;
            }
            uint remainder = sub(amount, a.newtot);
            if (remainder > 0) {
                a.i = 0;
                a.j = 0;
                while (a.i < a.pegsteps) {
                    if (a.i > a.section) {
                        break;
                    }
                    if (a.i == a.section) {
                        while (a.j < a.mk) {
                            if (a.j == a.k) {
                                break;
                            }
                            if (reserve[a.pegsteps + a.j] > 0) {
                                reserve[a.pegsteps + a.j] -= 1;
                                if(b.mysize != a.pegsteps) {
                                    reserve2[a.pegsteps + a.j] += 1;
                                } else {
                                    reserve2[a.i] += 1;
                                }
                                remainder -= 1;
                                a.newtot += 1;
                            }
                            if (remainder == 0) {
                                break;
                            }
                            a.j += 1;
                        }
                        break;
                    }
                    if (a.i < a.section) {
                        if (reserve[a.i] > 0) {
                            reserve[a.i] -= 1;
                            reserve2[a.i] += 1;
                            remainder -= 1;
                            a.newtot += 1;
                        }
                    }
                    if (remainder == 0) {
                        break;
                    }
                    a.i += 1;
                }
            }
            require(a.newtot <= b.rval); //"Insufficient reserve funds."
        }
        if (receiver == minter) {
            require(b.AMMstatus == 0 && !isRouter[receiver]);
            IMinter(minter).burn2(sender,reserve2,a.section);
        }
        if (b.AMMstatus == 1) {
            ILiquidityPool(LiquidityPool).withdrawBuy(sender,reserve,a.section);
            if (b.mysize == a.pegsteps + a.mk) {
                (a.liquid, a.rval, a.reserve) = calculateBalance(receiver, 0);
                a.i = 0;
                while(a.i < b.mysize) {
                    a.reserve[a.i] += reserve2[a.i];
                    a.i += 1;
                }
                Rbalances[receiver] = a.reserve;
                highkey[receiver] = a.section;
            }
        } else {
            Rbalances[sender] = reserve;
            highkey[sender] = a.section;
        }
        //There is no time delay for deposits and sales to an approved AMM
        if (b.AMMstatus == 2) { //We have detected the user might be depositing to an AMM
            require(routerVars[b.sender2][1] != 0); //"Deposits to this AMM must be made from the BitBay router"
            if (routerVars[b.sender2][1] == 1) { //Deposit
                ILiquidityPool(LiquidityPool).deposit2(mintTo[b.sender2],receiver,reserve2,0);
            } else { //Trade
                ILiquidityPool(LiquidityPool).deposit2(sender,receiver,reserve2,1);
            }
            if(routerVars[b.sender2][0] == 0) { //Check if there is a pending liquid deposit
                mintTo[b.sender2] = address(0);
            }
            routerVars[b.sender2][1] = 0;
        }
        if (isRouter[receiver] && b.AMMstatus == 0) {
            (a.liquid, a.rval, a.reserve) = calculateBalance(receiver, 0);
            a.i = 0;
            while(a.i < b.mysize) {
                a.reserve[a.i] += reserve2[a.i];
                a.i += 1;
            }
            Rbalances[receiver] = a.reserve;
            highkey[receiver] = a.section;
        }
        uint overwrite = 1;
        if (b.mysize == a.pegsteps) {
            if (recenttimestamp[receiver] == 0) {
                overwrite = 0;
                recenttimestamp[receiver] = block.timestamp;
            } else {
                if ((block.timestamp - recenttimestamp[receiver]) / (reservetimelock / 4) != 0) {
                    //More than 1/4 the time has passed so we add to a new slot
                    overwrite = 0;
                    recenttimestamp[receiver] = block.timestamp;
                }
            }
            if (overwrite == 0) {
                a.i = 0;
                while (a.i < 4) {
                    if (FrozenTXDBTimeSpent[receiver][a.i][0] == 0) { //Open slot
                        FrozenTXDBTimeSpent[receiver][a.i][0] = 1;
                        FrozenTXDBTimeSpent[receiver][a.i][1] = recenttimestamp[receiver];
                        a.j = 0;
                        while (a.j < a.pegsteps) {
                            FrozenTXDB[receiver][a.i][a.j] = reserve2[a.j];
                            a.j += 1;
                        }
                        unspentslots[receiver] += 1;
                        break;
                    }
                    a.i += 1;
                }
                //If automaticUnfreeze is not active, a user could wait too long and run out of slots.
                //Therefore, users should redeem their frozen funds occasionally.
                require(a.i < 4); //"Slot not found"
            }
            if (overwrite == 1) {
                a.i = 0;
                while (a.i < 4) {
                    if (FrozenTXDBTimeSpent[receiver][a.i][1] == recenttimestamp[receiver]) { //Most recent slot
                        break;
                    }
                    a.i += 1;
                }
                require(FrozenTXDBTimeSpent[receiver][a.i][0] == 1); //"Slot not filled"
                a.j = 0;
                while (a.j < a.pegsteps) {
                    FrozenTXDB[receiver][a.i][a.j] += reserve2[a.j];
                    a.j += 1;
                }
            }
        }
        emit TransferReserve(sender, receiver, a.newtot);
        lock = false;
        return true;
    }
    
    //Move timelocked funds to your main balance
    function ReleaseFrozenFunds(address receiver) public returns (bool) {
        calcLocals memory a;
        a.reserve = Rbalances[receiver];
        a.pegsteps = pegsteps;
        a.mk = microsteps;
        a.supply = currentSupply;
        a.section = highkey[receiver];
        a.i = 0;
        a.j = 0;
        a.k = a.supply % a.mk;
        uint val = 0;
        uint liq = 0;
        uint res = 0;
        uint found = 0;
        uint l = 0;
        while (a.i < 4) {
            //A grace period of 1/10th the time is given to make sure slots are always made available
            if (FrozenTXDBTimeSpent[receiver][a.i][0] == 1 && FrozenTXDBTimeSpent[receiver][a.i][1] + ((reservetimelock * 9) / 10) < block.timestamp) {
                found = 1;
                a.j = 0;
                while (a.j < a.pegsteps) {
                    val = FrozenTXDB[receiver][a.i][a.j];
                    if (a.j < a.section) {
                        a.reserve[a.j] += val;
                        res += val;
                    }
                    if (a.j > a.section) {
                        a.reserve[a.j] += val;
                        liq += val;
                    }
                    if (a.j == a.section) {
                        l = 0;
                        a.newtot = val;
                        a.liquid = a.newtot / a.mk;
                        while (l < a.mk - 1) {                            
                            a.newtot -= a.liquid;
                            a.reserve[a.pegsteps + l] += a.liquid;
                            if (l < a.k) {
                                res += a.liquid;
                            } else {
                                liq += a.liquid;
                            }
                            l += 1;
                        }
                        liq += a.newtot;
                        a.reserve[a.pegsteps + l] += a.newtot;
                    }
                    a.j += 1;
                }
                FrozenTXDBTimeSpent[receiver][a.i][0] = 0;
                unspentslots[receiver] -= 1;
            }
            a.i += 1;
        }
        if (found == 0) {
            return false;
        }
        Rbalances[receiver] = a.reserve;
        emit TransferReserve(receiver, receiver, res);
        emit Transfer(receiver, receiver, liq);
        return true;
    }
}