// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity >=0.8.4;

interface IHALO {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

contract HALO {
    string public constant name     = "Halo";
    string public constant symbol   = "HALO";
    string public version  = "1";
    uint public decimals = 8;
    uint public totalSupply;
    address public minter;
    uint pegrate;
    uint pegsteps;
    uint interval;
    uint intervaltime;
    uint currentSupply;
    uint maxchange;
    uint reservetimelock;
    uint changefrequency;
    uint microsteps;
    bool active;
    
    //This system is for a user friendly smooth liquid peg.
    mapping (address => uint) public balances;
    mapping (address => uint[2]) public highkey;
    mapping (uint => mapping (uint => uint)) public supplyData;
    mapping (address => mapping (address => uint)) private allowed;
    mapping (address => mapping (address => uint)) private allowedReserve;
    
    // Events allow clients to react to specific contract changes you declare
    event Approval(address from, address to, uint amount);
    event ApprovalReserve(address from, address to, uint amount);
    event Transfer(address from, address to, uint amount);
    event TransferReserve(address from, address to, uint amount);

    function mint(address receiver, uint amount) private {
        require(msg.sender == minter);
        require(amount < 1e58);
        balances[receiver] += amount; //reset the interval
        highkey[receiver] = [interval, 0]; //interval, supply
    }
    
    //User balances are actually arrays, include peg steps here and in constructor
    mapping (address => uint[27]) public Rbalances; //Steps + microsteps - 1 (the last microstep always gets mixed on deflation)
    
    constructor() {
        minter = msg.sender;
        active = true;//used for emergency updates
        pegrate = 93;//7% micro deflation rate compound (100=93)/100
        pegsteps = 23;//With microsteps total supplies is 23 * 5
        microsteps = 5;
        interval = 0;
        intervaltime = block.timestamp;
        currentSupply = 0;
        maxchange = 40;
        reservetimelock = 120;
        changefrequency = 60;
        totalSupply = 1e17;
        uint l = 0;
        uint m;
        while (l < pegsteps) {  //Starting at supply zero
            supplyData[l][0] = pegsteps - 1 - l;
            m = 1;
            while (m < microsteps + 1) {
                if (m > 1) {
                    supplyData[l][m] = pegsteps - l;
                }
                if (m == 1) {
                    supplyData[l][m] = pegsteps - 1 - l;
                }
                m += 1; 
            }
            interval += 1;
            l += 1;
        }
        mint(minter, totalSupply);
    }
    
    //Users need to separate frozen coins until they unlock
    mapping (address => uint[][]) public FrozenTXDB;
    //Because arrays can not be popped, a user should be able to set a starting index to scan from. Also length is stored
    mapping (address => uint[2]) public FrozenTXDBIndex;
    
    //Increase or decrease the total system supply changing each users ratio of liquid and reserve coins based on their arrays
    function setSupply(uint x) public {
        //Total supplies is peg steps 
        require(msg.sender == minter);
        require(x < (pegsteps * microsteps));
        if (x > currentSupply) {
            require(x - currentSupply <= maxchange, "Change in supply is too large.");
        }
        if (x < currentSupply) {
            require(currentSupply - x <= maxchange, "Change in supply is too large.");
        }
        require(intervaltime + changefrequency < block.timestamp, "Change in supply is too frequent");
        intervaltime = block.timestamp;
        interval += 1;
        //Currently large jumps are made when moving to compressed sections. We can also consider to allow smaller smoother jumps
        //however it would be an instant inflation and deflation to properly calculate the distribution of the compressed coins.
        //Alternatively one can just set the supply to inflate and then immediately deflate.
        if (x / microsteps < currentSupply / microsteps) {
            require(x % microsteps == 0, "Inflation when moving to a new section must be divisible by microsteps to avoid mixing of sections.");
        }
        supplyData[x / microsteps][0] = interval;//format is supply index and the latest interval nonce to see it
        supplyData[x / microsteps][(x % microsteps) + 1] = interval;//remaining data for microsteps is stored in the following indices
        currentSupply = x;
    }
    
    //Gets the liquid/reserve supply index.
    function getSupply() public view returns (uint) {
        return currentSupply;
    }
    
    //Find frozen coins we can add to the balance
    function getUnfrozenIndices(uint timebuffer) public view returns (uint[] memory) {
        uint[] memory indices;
        timebuffer += reservetimelock;
        uint i = FrozenTXDBIndex[msg.sender][0];
        uint leng = FrozenTXDBIndex[msg.sender][1];
        uint counter = 0;
        uint steps = pegsteps;
        uint mk = microsteps;
        while (i < leng) {
            if (FrozenTXDB[msg.sender][i][steps + mk - 1] + timebuffer < block.timestamp && FrozenTXDB[msg.sender][i][steps + mk - 1] != 0) {
                counter += 1;
            }
            i += 1;
        }
        indices = new uint[](counter);
        i = FrozenTXDBIndex[msg.sender][0];
        counter = 0;
        while (i < leng) {
            if (FrozenTXDB[msg.sender][i][steps + mk - 1] + timebuffer < block.timestamp && FrozenTXDB[msg.sender][i][steps + mk - 1] != 0) {
                indices[counter] = i;
                counter += 1;
            }
            i += 1;
        }
        return indices;
    }
    
    //Get data about frozen transactions.
    function getFrozenData(uint index) public view returns (uint[] memory) {
        return FrozenTXDB[msg.sender][index];
    }
    
    //To increase variables on stack
    struct calcLocals {
        uint lbuffer;
        uint rbuffer;
        uint liquid;
        uint rval;
        uint[27] reserve;
        uint i;
        uint j;
        uint k;
        uint l;
        uint lkey;
        uint changed;
        uint liquid2;
        uint newtot;
        uint d;
        uint[2] highkey;
        uint hk;
        uint mk;
        uint supply;
        uint pegsteps;
        uint pegrate;
    }
    
    //ERC20 style functions
    function balanceOf(address user) public view returns (uint balance) {
        (uint liquid, , , , ) = calculateBalance(user, 1);
        return liquid;
    }
    
    function reserveBalanceOf(address user) public view returns (uint balance) {
        (, uint rval, , , ) = calculateBalance(user, 1);
        return rval;
    }
    
    function allowance(address owner, address spender) public view returns (uint) {
        return allowed[owner][spender];
    }
    
    function allowanceReserve(address owner, address spender) public view returns (uint) {
        return allowedReserve[owner][spender];
    }
    
    //Allowances should be reset to zero before changing them. Otherwise you can use increase or decrease functions.
    function approve(address spender, uint value) public returns (bool) {
        require(active);
        require(spender != address(0));
        allowed[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }
    
    function increaseAllowance(address spender, uint value) public returns (bool) {
        require(active);
        require(spender != address(0));
        allowed[msg.sender][spender] += value;
        emit Approval(msg.sender, spender, allowed[msg.sender][spender]);
        return true;
    }
    
    function decreaseAllowance(address spender, uint value) public returns (bool) {
        require(active);
        require(spender != address(0));
        allowed[msg.sender][spender] -= value;
        emit Approval(msg.sender, spender, allowed[msg.sender][spender]);
        return true;
    }
    
    function approveReserve(address spender, uint value) public returns (bool) {
        require(active);
        require(spender != address(0));
        allowedReserve[msg.sender][spender] = value;
        emit ApprovalReserve(msg.sender, spender, value);
        return true;
    }
    
    function increaseAllowanceReserve(address spender, uint value) public returns (bool) {
        require(active);
        require(spender != address(0));
        allowedReserve[msg.sender][spender] += value;
        emit ApprovalReserve(msg.sender, spender, allowedReserve[msg.sender][spender]);
        return true;
    }
    
    function decreaseAllowanceReserve(address spender, uint value) public returns (bool) {
        require(active);
        require(spender != address(0));
        allowedReserve[msg.sender][spender] -= value;
        emit ApprovalReserve(msg.sender, spender, allowedReserve[msg.sender][spender]);
        return true;
    }
    
    function transfer(address to, uint value) public returns (bool) {
        return sendLiquid(msg.sender, to, value);
    }
    
    function transferFrom(address from, address to, uint value) public returns (bool) {
        return sendLiquid(from, to, value);
    }
    
    function transferReserve(address to, uint value) public returns (bool) {
        uint[] memory a;
        return sendReserve(msg.sender, to, value, a);
    }
    
    function transferReserveFrom(address from, address to, uint value) public returns (bool) {
        uint[] memory a;
        return sendReserve(from, to, value, a);
    }
    
    //TIP: you may want to assume your maximum balances are reduced by a buffer in case of reorganizations near a supply change
    function calculateBalance(address user, uint buffer) public view returns (uint, uint, uint[27] memory, uint, uint) {
        calcLocals memory a;
        a.liquid = balances[user];
        a.reserve = Rbalances[user];
        a.highkey = highkey[user];
        a.supply = currentSupply;
        a.mk = microsteps;
        a.pegsteps = pegsteps;
        a.pegrate = pegrate;
        a.hk = a.highkey[1] / a.mk;
        if (a.highkey[0] != interval) {
            //This function checks for low key so liquidity is mixed on chain for smooth liquid peg
            a.lkey = a.highkey[1];
            //First find distance of deflation
            if (a.lkey < a.supply) {
                a.changed = 1;
                a.d = a.supply - a.lkey;
            }
            a.newtot = balances[user];
            //This iteration discovers if the supply has inflated since the user last updated balance
            while (a.i <= a.hk) { //Check larger sections for a newer time first
                if (a.changed < 2) {
                    if (a.highkey[0] < supplyData[a.i][0]) {
                        while (a.j < a.mk) {
                            if (a.highkey[0] < supplyData[a.i][a.j + 1]) {
                                if ((a.i * a.mk) + a.j < a.lkey) {
                                    a.lkey = (a.i * a.mk) + a.j;
                                    a.changed += 2;
                                    a.d = a.supply - a.lkey;
                                    if (a.d > 0) {
                                        a.changed = 3; //Inflation followed by deflation
                                    }
                                    if (a.i == a.hk) { //We are within the same microkey section
                                        a.k = a.highkey[1] % a.mk;
                                        while (a.j < a.k) {
                                            //Add in reserves before deflation
                                            if (a.reserve[a.pegsteps + a.j] != 0) {
                                                a.newtot += a.reserve[a.pegsteps + a.j];
                                                a.reserve[a.pegsteps + a.j] = 0;
                                            }
                                            a.j += 1;
                                        }
                                        //Here is a good moment to check for deflation to new section and if so, shift last keys to bulk
                                        if (a.hk < (a.supply / a.mk)) {
                                            a.k = 0;
                                            while (a.k < a.j) {
                                                //Add in micro-reserve before deflation
                                                if (a.reserve[a.pegsteps + a.k] != 0) {
                                                    a.reserve[a.i] += a.reserve[a.pegsteps + a.k];
                                                    a.reserve[a.pegsteps + a.k] = 0;
                                                }
                                                a.k += 1;
                                            }
                                        }
                                        a.l = 1;
                                    }
                                    if (a.i != a.hk) { //We moved to a different section
                                        a.k = a.mk - 1;
                                        a.j = 0;
                                        while (a.j < a.k) {
                                            //Add in micro-reserve before inflation
                                            if (a.reserve[a.pegsteps + a.j] != 0) {
                                                a.newtot += a.reserve[a.pegsteps + a.j];
                                                a.reserve[a.pegsteps + a.j] = 0;
                                            }
                                            a.j += 1;
                                        }
                                        a.l = 2;
                                    }                   
                                    break;
                                }
                            }
                            a.j += 1;
                        }
                    }
                }
                if (a.changed > 1) {
                    if (a.l == 0) {
                        if (a.reserve[a.i] != 0) {
                            a.newtot += a.reserve[a.i];
                            a.reserve[a.i] = 0;
                        }
                    }
                    if (a.l == 1) {
                        break;
                    }
                    if (a.l == 2) {
                        if (a.i == (a.supply / a.mk)) { //within section
                            //Shift to left to avoid mixing reserve with liquid. If you want smoother inflation then add detection for max supply per section
                            //and then allow coins to occasionally mix into different sections. And find a method for dividing across micro-keys
                            if (a.lkey % a.mk > 0) {
                                a.reserve[a.pegsteps] += a.reserve[a.i];
                                a.reserve[a.i] = 0;
                            }
                        }
                        if (a.lkey % a.mk == 0) {
                            a.newtot += a.reserve[a.i];
                            a.reserve[a.i] = 0;
                        }
                        a.l = 0;
                    }
                }
                a.i += 1;
            }
            //If you had experienced no inflation then can shift micro-keys to left if deflating to new section!
            //Otherwise during deflation, all we want to know is where to put the funds, we either deflate in bulk or within micro-keys once at current supply
            if (a.changed > 0 && a.changed != 2) {
                a.l = (a.lkey / a.mk);
                if (a.changed != 3 && a.hk < (a.supply / a.mk)) { //We never inflated. Mix the keys, moving out of the section
                    a.i = 0;
                    a.j = a.hk % a.mk;
                    while (a.i < a.j) {
                        if (a.reserve[a.pegsteps + a.i] != 0) {
                            a.reserve[a.l] += a.reserve[a.pegsteps + a.i];
                            a.reserve[a.pegsteps + a.i] = 0;
                        }
                        a.i += 1;
                    }
                }
                a.k = a.mk - (a.lkey % a.mk); //First we measure the furthermost piece
                if (a.k != a.mk && a.l != (a.supply / a.mk)) { //We are moving out of the section
                    a.d -= a.k; //reduce distance
                    a.liquid2 = a.newtot - (a.newtot * (a.pegrate ** a.k)) / (100 ** a.k);
                    a.newtot -= a.liquid2;
                    a.reserve[(a.l)] = a.liquid2;
                    a.k = 0;
                }
                a.k = 0;
                if (a.l == (a.supply / a.mk)) { //We are deflating within the same section.
                    a.k = a.lkey % a.mk; //We get the position of the low key
                }
                a.i = 0;
                while (a.i < a.d) {
                    if (a.d - a.i < a.mk) { //Last key
                        a.liquid2 = (a.newtot * (100 - a.pegrate)) / 100;
                        a.newtot -= a.liquid2;
                        a.reserve[a.pegsteps + (a.k)] += a.liquid2;
                        a.k += 1; //We got this positional variable previously
                        a.i += 1;
                    }
                    if (a.d - a.i >= a.mk) { //Bulk movements
                        a.liquid2 = a.newtot - (a.newtot * (a.pegrate ** a.mk)) / (100 ** a.mk);
                        a.newtot -= a.liquid2;
                        a.reserve[(a.i / a.mk) +  a.l] += a.liquid2;
                        a.i += a.mk;
                    }
                }
            }
            a.liquid = a.newtot;
        }
        //Buffer is to calculate for reorganizations which is useful for users who are working with contracts
        //It is recommended buffer should be at least the maximum supply change value. Setting a buffer also checks the reserve balance.
        if (buffer > 0) {
            a.i = 0;
            a.k = a.supply % a.mk;
            uint buffer2 = buffer;
            //A user is requesting their reserve balance if buffer > 0
            while (a.i < a.k) {
                a.rval += a.reserve[a.pegsteps + a.i];
                if (buffer2 > 0) {
                    a.rbuffer += a.reserve[a.pegsteps + (a.k - (a.i + 1))];
                    buffer2 -= 1;    
                }
                a.i += 1;
            }
            a.j = a.supply / a.mk;
            a.i = 0;
            while (a.i < a.j) {
                a.rval += a.reserve[a.i];
                if (buffer2 / a.mk > 0) { //assuming bulk inflation and reserve shift
                    a.rbuffer += a.reserve[a.j - (a.i + 1)];
                    buffer2 -= a.mk;
                }
                a.i += 1;
            }
            a.i = 0;
            a.newtot = a.liquid;
            //Iteration avoids overflow from exponential calculations however it costs more computation power. This Iteration doesn't check for max supply
            while (a.i < buffer) { 
                a.liquid2 = (a.newtot * (100 - a.pegrate)) / 100;
                a.newtot -= a.liquid2;
                if (a.newtot > 0) {
                    a.newtot -= 1; //in case of rounding errors
                    a.liquid2 += 1;
                }
                a.lbuffer += a.liquid2;
                a.i += 1;
            }
        }
        return (a.liquid, a.rval, a.reserve, a.lbuffer, a.rbuffer);
    }
    
    struct liquidLocals {
        uint changed;
        uint changed2;
        uint liquid;
        uint liquid2;
    }
    //Sends liquid coins and recalculates balances of sender and recipient
    //Always reserve enough gas to update your balance in case of peg and balance changes
    function sendLiquid(address sender, address receiver, uint amount) public returns (bool) {        
        require(active);
        require(amount > 0, "No funds sent.");
        if (sender != msg.sender) {
            require(amount <= allowed[sender][msg.sender]);
            allowed[sender][msg.sender] -= amount;
        }
        liquidLocals memory a;
        a.changed = 1;
        a.changed2 = 1;
        uint[27] memory reserveM;
        //Check for a supply change
        if (highkey[sender][0] == interval) {
            a.changed = 0;
            a.liquid = balances[sender];
        }
        if (a.changed == 1) {
            (uint liquid3, , uint[27] memory reserve, , ) = calculateBalance(sender, 0);
            a.liquid = liquid3;
            reserveM = reserve;
        }
        require(amount <= a.liquid, "Insufficient liquid balance.");
        if (sender == receiver) {
            if (a.changed == 1) {
                Rbalances[sender] = reserveM;
            }
            balances[sender] = a.liquid;
            highkey[sender] = [interval, currentSupply];//they essentially paid to update their balance
            return true;
        }
        //IMPORTANT: You should usually assume you are the one who will have to pay to update the recipients balance
        if (highkey[receiver][0] == interval) {
            a.changed2 = 0;
            a.liquid2 = balances[receiver];
        }
        if (a.changed2 == 1) {
            (uint liquid4, , uint[27] memory reserve2, , ) = calculateBalance(receiver, 0);
            a.liquid2 = liquid4;
            Rbalances[receiver] =  reserve2;
        }
        if (a.changed == 1) {
            Rbalances[sender] = reserveM;
        }
        balances[sender] = a.liquid - amount;
        highkey[sender] = [interval, currentSupply];//interval nonce and supply index of latest transaction of funds
        
        balances[receiver] = a.liquid2 + amount;
        highkey[receiver] = [interval, currentSupply];//interval nonce and supply index of latest transaction of funds
        emit Transfer(sender, receiver, amount);
        return true;
    }
    
    // Sends reserve coins and recalculates balances of sender and gives the recipient a timelocked payment.
    function sendReserve(address sender, address receiver, uint amount, uint[] memory specialtx) public returns (bool) {
        require(active);
        if (sender != msg.sender) {
            require(amount <= allowedReserve[sender][msg.sender]);
            allowedReserve[sender][msg.sender] -= amount;
        }
        //Balance will recalculate. Be careful to predict which reserve coins might become liquid on peg change so TX goes through
        (, uint rval, uint[27] memory reserve, , ) = calculateBalance(sender, 1);
        uint[28] memory reserve2;//An entry is added for timestamp and to see if the tx is spent
        //Unless an exchange has a special orderbook where people buy specific reserve coins, then it's best
        //to let the users exchange their full range of reserve. However maybe some exchanges will let users sell
        //reserve in different ranges similar to a futures market. There is lot's of great possibilities here.
        calcLocals memory a;
        a.supply = currentSupply;
        a.mk =  microsteps;
        a.k = a.supply / a.mk;
        a.l = a.supply % a.mk;
        a.pegsteps = pegsteps;
        if (specialtx.length != 0) {
            amount = 0;
            while (a.i < a.pegsteps) {
                if (a.i > a.k) {
                    break;
                }
                if (a.i == a.k) {
                    while (a.j < a.mk - 1) {
                        if (a.j == a.l) {
                            break;
                        }
                        require(specialtx[a.pegsteps + a.j] <= reserve[a.pegsteps + a.j], "Index does not contain enough micro-reserve!");
                        amount += specialtx[a.pegsteps + a.j];
                        reserve2[a.i] += specialtx[a.pegsteps + a.j]; //We consolidate to the supply index
                        reserve[a.pegsteps + a.j] -= specialtx[a.pegsteps + a.j];
                        a.j += 1;
                    }
                    break;
                }
                if (a.i < a.k) {
                    require(specialtx[a.i] <= reserve[a.i], "Index does not contain enough reserve!");
                    amount += specialtx[a.i];
                    reserve2[a.i] += specialtx[a.i];
                    reserve[a.i] -= specialtx[a.i];
                }
                a.i += 1;
            }
            require(amount <= rval, "Insufficient reserve balance.");
        }
        require(amount > 0, "No funds sent");
        if (specialtx.length == 0) {
            require(amount <= rval, "Insufficient reserve balance.");
            uint propval = 0;
            uint tot = 0;
            while (a.i < a.pegsteps) {
                if (a.i > a.k) {
                    break;
                }
                if (a.i == a.k) {
                    while (a.j < a.mk - 1) {
                        if (a.j == a.l) {
                            break;
                        }
                        propval = (amount * reserve[a.pegsteps + a.j]) / rval;
                        reserve2[a.i] += propval; //We consolidate to the supply index
                        reserve[a.pegsteps + a.j] -= propval;
                        tot += propval;
                        a.j += 1;
                    }
                    break;
                }
                if (a.i < a.k) {
                    propval = (amount * reserve[a.i]) / rval;
                    reserve2[a.i] += propval;
                    reserve[a.i] -= propval;
                    tot += propval;
                }
                a.i += 1;
            }
            uint remainder = amount - tot;
            if (remainder > 0) {
                a.i = 0;
                a.j = 0;
                while (a.i < a.pegsteps) {
                    if (a.i > a.k) {
                        break;
                    }
                    if (a.i == a.k) {
                        while (a.j < a.mk - 1) {
                            if (a.j == a.l) {
                                break;
                            }
                            if (reserve[a.pegsteps + a.j] > 0) {
                                reserve[a.pegsteps + a.j] -= 1;
                                reserve2[a.i] += 1;
                                remainder -= 1;
                                tot += 1;
                            }
                            if (remainder == 0) {
                                break;
                            }
                            a.j += 1;
                        }
                        break;
                    }
                    if (a.i < a.k) {
                        if (reserve[a.i] > 0) {
                            reserve[a.i] -= 1;
                            reserve2[a.i] += 1;
                            remainder -= 1;
                            tot += 1;
                        }
                    }
                    if (remainder == 0) {
                        break;
                    }
                    a.i += 1;
                }
            }
            require(tot <= rval, "Insufficient reserve balance.");
        }
        Rbalances[sender] = reserve;
        highkey[sender] = [interval, a.supply];
        reserve2[a.pegsteps + a.mk - 1] = block.timestamp;
        FrozenTXDB[receiver].push(reserve2);
        FrozenTXDBIndex[receiver][1] += 1;
        emit TransferReserve(sender, receiver, amount);
        return true;
    }
    
    //Move timelocked funds to your main balance
    function ReleaseFrozenFunds(uint[] memory indices) public returns (bool) {
        require(active);
        //We should have the user specify which indices they want to move so a user is aware of gas costs
        uint liq = 0;
        uint res = 0;
        uint mylen = indices.length;
        uint val = 0;
        calcLocals memory a;
        a.pegsteps = pegsteps;
        a.mk = microsteps;
        a.i = 0;
        a.supply = currentSupply;
        a.k = a.supply / a.mk;
        a.l = a.supply % a.mk;
        (, , uint[27] memory reserve, , ) = calculateBalance(msg.sender, 1);
        while (a.i < mylen) {
            //It is strongly recommended you wait extra time after a freeze before redeeming
            if (FrozenTXDB[msg.sender][indices[a.i]][a.pegsteps + a.mk - 1] + reservetimelock < block.timestamp && FrozenTXDB[msg.sender][indices[a.i]][a.pegsteps + a.mk - 1] != 0) {
                a.j = 0;
                while (a.j < a.pegsteps) {
                    val = FrozenTXDB[msg.sender][indices[a.i]][a.j];
                    if (a.j < a.k) {
                        reserve[a.j] += val;
                        res += val;
                    }
                    if (a.j > a.k) {
                        liq += val;
                    }
                    if (a.j == a.k) {
                        if (a.l == 0) {
                            liq += val;
                        }
                        if (a.l != 0) {
                            reserve[pegsteps] += val;
                            res += val;
                        }
                    }
                    a.j += 1;
                }
                FrozenTXDB[msg.sender][indices[a.i]][a.pegsteps + a.mk - 1] = 0;
            }
            a.i += 1;
        }
        uint consecutiveleng = 0;
        mylen = FrozenTXDBIndex[msg.sender][1];
        a.i = FrozenTXDBIndex[msg.sender][0];
        //Search for spent transactions to know array starting position
        while (a.i < mylen) {
            if (FrozenTXDB[msg.sender][a.i][a.pegsteps + a.mk - 1] == 0) {
                consecutiveleng += 1;
            }
            if (FrozenTXDB[msg.sender][a.i][a.pegsteps + a.mk - 1] != 0) {
                break;
            }
            a.i += 1;
        }
        FrozenTXDBIndex[msg.sender][0] += consecutiveleng;
        balances[msg.sender] += liq;
        Rbalances[msg.sender] = reserve;
        highkey[msg.sender] = [interval, a.supply];
        emit TransferReserve(msg.sender, msg.sender, res);
        emit Transfer(msg.sender, msg.sender, liq);
        return true;
    }
}

//The AMM liquid mix strategy is as follows:
//User deposits and their funds are moved to a new non-mixed smart contract instead of the pool. Everything is tracked and the
//AMM tokens are moved to a contract that manages everything separately for all the users. The AMM tokens are representing ETH only.
//Then, when a buyer purchases it iterates the users and sends to them directly by crediting them the amount of ETH owed for
//the trade. The system can limit total LPs to a specific amount and require higher deposits for efficient gas costs. Recipients
//can be chosen at random to keep it relatively distributed. During withdrawal the contract itself is triggered to send the LP
//tokens instead of the individual user. It will calculate how much LP tokens need to be burned to get the owed amount of ETH.
//Liquidity pool balance inquiries may defer to the connected contract to the AMM iterating all the users.
//For reserve there would only be individual markets for each specific index like a bond. It's recommended that those are spot
//because as it approaches to be released it's value would change. Although automatic price calculations can be made respectively.