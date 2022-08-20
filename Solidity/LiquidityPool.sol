// SPDX-License-Identifier: GPL-3.0
pragma solidity = 0.8.4; //Required to hand memory safe decoding of arrays

interface ILiquidityPool {
    function deposit(address,address,uint256[38] memory,uint256) external;
    function calculateBalance(address, address, bool, uint256)  external view returns (uint256, uint256, uint256[38] memory);
    function poolhighkey(address) external view returns (uint256);
}

contract Pool is ILiquidityPool {
    // --- ERC20 Data ---
    string public constant name = "BitBay Pools";
    string public version  = "1";
    address public proxy; //Where all the peg functions and storage are
    address public minter;

    mapping (address => mapping (address => uint[38])) public reserveatpool;
    mapping (address => mapping (address => uint)) public highkeyatpool;
    mapping (address => mapping (address => uint)) public LPtokens;
    mapping (address => uint[38]) public poolbalance;
    mapping (address => uint) public override poolhighkey;
    bool public magnify = true;
    bool public bothsides = true;
    uint public matchprecision = 5;
    mapping (address => address) public pairtoken;
    mapping (address => address) public myfactory;
    mapping (address => uint) public prevtokenbalance;
    mapping (address => bool) public addresscheck;
    mapping (address => uint) public prevlpbalance;
    mapping (address => bool) public isBAYpair;    
    address public BAYL;
    address public BAYR;
    bool public skipcheck;    

    constructor() {
        minter = msg.sender;
    }

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

    function setProxy(address myproxy) public returns (bool) {
        require(msg.sender == minter);
        require(proxy == address(0)); //Set this one time
        proxy = myproxy;
        return true;
    }
    function setProxies(address myBAYL, address myBAYR) public returns (bool) {
        require(msg.sender == minter);
        require(BAYL == address(0)); //Set this one time
        BAYL = myBAYL;
        BAYR = myBAYR;
        return true;
    }
    function setMagnify(bool status) public returns (bool) {
        require(msg.sender == minter);
        magnify = status;
        return true;
    }
    function setBothSides(bool status) public returns (bool) {
        require(msg.sender == minter);
        bothsides = status;
        return true;
    }
    function setPrecision(uint prec) public returns (bool) {
        require(msg.sender == minter);
        require(prec != 0);
        matchprecision = prec;
        return true;
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
    struct calcLocals2 {
        bool success;
        bytes result;
        uint[38] difference;
        uint[38] poolreserve;
        uint poolliquid;
        uint poolrval;
        uint deflationrate;
        uint amount;
        uint rval2;
        uint lval2;
        uint prval;
        uint plval;
    }

    //A person who wants to code a contract that is compatible with BAY can simply add these 4 functions.
    //These are functions typical to any AMM contract. Sync is required to keep balances up to date.
    //Users should be careful to set a gas limit when using regular BitBay payments to new addresses.
    function checkAMM(address AMM) external returns (address, address, address) {
        //Users should proceed with caution and audit any AMM they wish to list on
        //This is because it's unclear if the functions operate like a standard AMM
        address[3] memory myaddy;
        skipcheck = true;
        addresscheck[AMM] = false;
        (bool success, bytes memory result) = AMM.call(abi.encodeWithSignature("sync()"));
        skipcheck = false;
        //(bool success, bytes memory result) = AMM.staticcall(abi.encodeWithSignature("balanceOf(address),AMM"));
        if(msg.sender == proxy) {
            (success, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
            (uint supply,,uint mk,,) = abi.decode(result, (uint,uint,uint,uint,uint));
            poolhighkey[AMM] = (supply / mk); //It can start in sync because checkAMM is called only on first LP deposit
        }
        bool isProxy;
        (success, result) = AMM.staticcall(abi.encodeWithSignature("token0()"));
        require(success);
        (myaddy[0]) = abi.decode(result, (address));
        (success, result) = AMM.staticcall(abi.encodeWithSignature("token1()"));
        require(success);
        (myaddy[1]) = abi.decode(result, (address));
        (success, result) = proxy.staticcall(abi.encodeWithSignature("isProxy(address)",myaddy[0]));
        require(success);
        (isProxy) = abi.decode(result, (bool));
        if(isProxy == true) {
            pairtoken[AMM] = myaddy[1];
            isBAYpair[AMM] = true;
        } else {
            (success, result) = proxy.staticcall(abi.encodeWithSignature("isProxy(address)",myaddy[1]));
            require(success);
            (isProxy) = abi.decode(result, (bool));
            if(isProxy == true) {
                pairtoken[AMM] = myaddy[0];
                isBAYpair[AMM] = true;
            }
        }
        (success, result) = AMM.staticcall(abi.encodeWithSignature("factory()"));
        (myaddy[2]) = abi.decode(result, (address));
        myfactory[AMM] = myaddy[2];
        return (myaddy[0], myaddy[1], myaddy[2]);
    }
    function syncAMM(address AMM) external {
        bool success;
        bytes memory result;
        calcLocals memory a;
        addresscheck[AMM] = false;
        (a.liquid, a.rval, a.reserve) = calculateBalance(msg.sender,AMM,true,0);
        (success, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
        (a.supply,a.pegsteps,a.mk,a.pegrate,a.i) = abi.decode(result, (uint,uint,uint,uint,uint));
        poolbalance[AMM] = a.reserve;
        poolhighkey[AMM] = (a.supply / a.mk);
        skipcheck = true;
        (success, result) = AMM.call(abi.encodeWithSignature("sync()"));
        skipcheck = false;
        require(success);
    }
    function deposit2(address user, address pool, uint[] memory reserve, uint trade) external {
        require(msg.sender == proxy);
        uint x = 0;
        uint[38] memory reserve2;
        while(x < 38) {
            reserve2[x] = reserve[x];
            x += 1;
        }
        deposit(user, pool, reserve2, trade);
    }
    //IMPORTANT: When interacting with AMM exchanges please follow these guidelines or risk losing funds.
    //Don't send your AMM tokens privately or else you risk funds set aside in the pool after supply changes.
    //Do not trade with an AMM that is not approved by the community and be careful to audit those contracts.
    //Do not trade with an AMM via a proxy contract unless you are extremely sure the proxy contract is secure.
    function deposit(address user, address pool, uint[38] memory reserve, uint trade) public virtual override {
        require(msg.sender == proxy);
        calcLocals memory a;
        uint[38] memory reserve2;
        bool success;
        bytes memory result;
        (a.liquid, a.rval, a.reserve) = calculateBalance(msg.sender,pool,true,0);
        if(trade == 0) {
            (a.liquid, a.rval, reserve2) = calculateBalance(user,pool,false,0);
        }
        (success, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
        (a.supply,a.pegsteps,a.mk,a.pegrate,a.i) = abi.decode(result, (uint,uint,uint,uint,uint));
        a.i = 0;
        while(a.i < a.pegsteps + a.mk) {
            a.reserve[a.i] += reserve[a.i];
            a.i += 1;
        }
        if(trade == 0) {
            a.i = 0;
            while(a.i < a.pegsteps + a.mk) {
                reserve2[a.i] += reserve[a.i];
                a.i += 1;
            }
            reserveatpool[user][pool] = reserve2;
            highkeyatpool[user][pool] = (a.supply / a.mk);
        }
        if(trade == 3) {
            addresscheck[pool] = true;
            (success, result) = pairtoken[pool].staticcall(abi.encodeWithSignature("balanceOf(address)",pool));
            require(success);
            prevtokenbalance[pool] = abi.decode(result, (uint));
        }
        poolbalance[pool] = a.reserve;
        poolhighkey[pool] = (a.supply / a.mk);
    }
    function withdrawBuy(address pool, uint[38] memory reserve, uint section) external {
        require(msg.sender == proxy);
        //Detect potential withdrawal from unofficial router
        (bool success, bytes memory result) = pool.staticcall(abi.encodeWithSignature("balanceOf(address)",pool));
        require(success);
        uint LPbal = abi.decode(result, (uint));
        if(LPbal == 0 && prevlpbalance[pool] != 0) {
            require(false, "Action was not performed by the official BitBay router");
        }
        poolbalance[pool] = reserve;
        poolhighkey[pool] = section;
    }
    function withdrawLP(address pool, address user, uint liquidity) external returns (uint[38] memory newreserve) {
        require(msg.sender == proxy);
        calcLocals memory a;
        uint[38] memory reserve2;
        uint[38] memory difference;
        bool success;
        bytes memory result;
        (a.liquid, a.rval, a.reserve) = calculateBalance(msg.sender,pool,true,0);
        (a.liquid, a.rval, reserve2) = calculateBalance(user,pool,false,0);
        (a.liquid, newreserve, difference) = calculatePoolBalanceV1(user,pool,0,liquidity,matchprecision,liquidity);        
        (success, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
        (a.supply,a.pegsteps,a.mk,a.pegrate,a.i) = abi.decode(result, (uint,uint,uint,uint,uint));
        a.i = 0;
        while(a.i < a.pegsteps + a.mk) {
            a.reserve[a.i] -= newreserve[a.i];
            reserve2[a.i] -= difference[a.i];
            a.i += 1;
        }
        LPtokens[user][pool] = sub(LPtokens[user][pool],liquidity);
        reserveatpool[user][pool] = reserve2;
        highkeyatpool[user][pool] = (a.supply / a.mk);
        poolbalance[pool] = a.reserve;
        poolhighkey[pool] = (a.supply / a.mk);
        return newreserve;
    }
    function addLPTokens(address to, address pool, uint liquidity) external {
        bool success;
        bytes memory result;
        (success, result) = proxy.staticcall(abi.encodeWithSignature("isRouter(address)",msg.sender));
        require(success);
        success = abi.decode(result, (bool));
        require(success);
        LPtokens[to][pool] = add(LPtokens[to][pool],liquidity);
    }
    function LPbalance(address pool) external {
        bool success;
        bytes memory result;
        if(msg.sender != proxy) {
            (success, result) = proxy.staticcall(abi.encodeWithSignature("isRouter(address)",msg.sender));
            require(success);
            success = abi.decode(result, (bool));
        }
        require(success || msg.sender == proxy);
        if(isBAYpair[pool] == true) {
            (success, result) = pool.staticcall(abi.encodeWithSignature("balanceOf(address)",pool));
            require(success);
            uint LPbal = abi.decode(result, (uint));
            if(LPbal != 0 && msg.sender != proxy) { //This prevents spam so withdrawals can be accurately detected
                skipcheck = true;
                (success, result) = BAYL.call(abi.encodeWithSignature("lockthis(address)",pool));
                require(success);
                (success, result) = BAYR.call(abi.encodeWithSignature("lockthis(address)",pool));
                require(success);
                //Burn any LP token spam found at the pair. To save on gas, BAY is not moved
                (success, result) = pool.call(abi.encodeWithSignature("burn(address)",pool));
                require(success);
                (success, result) = BAYL.call(abi.encodeWithSignature("lockthis(address)",address(0)));
                require(success);
                (success, result) = BAYR.call(abi.encodeWithSignature("lockthis(address)",address(0)));
                require(success);
                prevlpbalance[pool] = 0;
            } else {
                if(LPbal != 0) { //Only an official withdrawal can reset this to zero
                    prevlpbalance[pool] = LPbal;
                }
            }
        }
        skipcheck = false;
        addresscheck[pool] = false;
    }
    function calculateBalance(address user, address pool, bool isPool, uint buffer)  public view virtual override returns (uint, uint, uint[38] memory) {
        calcLocals memory a;
        uint deflationrate;
        bool success;
        bytes memory result;
        //This is so users can still buy from AMM sites directly. If there is a change in LP token balance it can be
        //suspected as a withdraw. In some situations a buy can be declined if LP balance changes if someone sacrifices tokens.
        //So it's still recommended to trade from the official BitBay router.
        if(buffer == 9999) { //Check for potential withdraw or deposit
            buffer = 0;
            if(user == pool && skipcheck == false) { //Buying or withdrawing funds
                (success, result) = pool.staticcall(abi.encodeWithSignature("balanceOf(address)",pool));
                require(success);
                a.i = abi.decode(result, (uint));
                if(a.i - prevlpbalance[pool] != 0) {
                    (success, result) = proxy.staticcall(abi.encodeWithSignature("withdrawAddy(address)",pool));
                    require(success);
                    require(abi.decode(result, (address)) != address(0), "Action was not performed by the official BitBay router");
                }
            }
            if(user == pool && addresscheck[pool] == true) { //If user didn't receive tokens from an official router then it's not a sale
                (success, result) = pairtoken[pool].staticcall(abi.encodeWithSignature("balanceOf(address)",pool));
                require(success);
                require(prevtokenbalance[pool] > abi.decode(result, (uint)), "Action was not performed by the official BitBay router");
            }
        }
        (success, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
        (a.supply,a.pegsteps,a.mk,a.pegrate,deflationrate) = abi.decode(result, (uint,uint,uint,uint,uint));
        if (isPool) {
            a.reserve = poolbalance[pool];
            a.highkey = poolhighkey[pool];
        } else {
            a.reserve = reserveatpool[user][pool];
            a.highkey = highkeyatpool[user][pool];
        }
        if (buffer != 0) {
            //To check supply at 0 just add liquid + reserve balances
            a.supply = buffer;
        }
        a.section = (a.supply / a.mk);
        a.i = 0;
        a.rval = 0;
        a.liquid = 0;
        a.k = a.supply % a.mk;
        
        if (a.section != a.highkey) { //Supply has changed sections, condense/distribute microshards
            a.i = 0;
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

    //This function calculates a users balance for a typical AMM exchange for contracts that share liquidity but do not
    //consider the reserve/liquid left behind. Many AMM exchanges contain sync functions to reevaluate the balances.
    //For example, reserve may be set aside for users. Therefore you need to calculate how the reserve is distributed.
    //Therefore a user may get their reserve returned as closely as possible even though the AMM doesn't consider it.
    //Since there is impermanent loss, there is no guarantee a perfect match will be found. This finds the best match.
    //The method is to take the percentage of the users chart requested and then radiate out for a certain precision
    //If there are any funds left over then an even withdraw is made from both the liquid and reserve remaining.
    function calculatePoolBalanceV1(address user, address pool, uint buffer, uint LP, uint precision, uint LPsupply) public view returns (uint, uint[38] memory, uint[38] memory) {
        calcLocals memory a;
        calcLocals2 memory b;
        (b.success, b.result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
        (a.supply,a.pegsteps,a.mk,a.pegrate,b.deflationrate) = abi.decode(b.result, (uint,uint,uint,uint,uint));        
        (b.success, b.result) = pool.staticcall(abi.encodeWithSignature("totalSupply()"));
        require(b.success);
        //Many AMMs burn coins before requesting a withdraw. So we can start with the supply higher initially
        LPsupply += abi.decode(b.result, (uint)); //(LP burned + remaining supply)
        require(LP <= LPsupply);
        if (buffer != 0) {
            //To check supply at 0 just add liquid + reserve balances
            a.supply = buffer;
        }
        (a.liquid, a.rval, a.reserve) = calculateBalance(user,pool,false,buffer);
        (b.poolliquid, b.poolrval, b.poolreserve) = calculateBalance(msg.sender,pool,true,buffer);
        a.section = (a.supply / a.mk);
        a.k = a.supply % a.mk;
        uint val;
        uint[38] memory newreserve;
        //First we find out how much the user antipates taking from the pool and get the chart for that.
        require(LPtokens[user][pool] > 0, "User has no liquidity");
        require(LP <= LPtokens[user][pool], "Too many tokens requested");
        uint skip = 0;
        if(a.liquid + a.rval == 0) { //It may be a fee account
            skip = 1;
        } else {
            //Take a percentage of the users pool. This is what we will try to match
            while(a.i < (a.pegsteps + a.mk)) {
                val = (a.reserve[a.i] * LP) / LPtokens[user][pool];
                b.difference[a.i] = val;
                a.reserve[a.i] = val;                
                a.newtot += val;
                if(bothsides == true) {
                    if(a.i < a.pegsteps) {
                        if(a.i < a.section) {
                            b.rval2 += val;
                        } else {
                            b.lval2 += val;
                        }
                    } else {
                        if((a.i - a.pegsteps) < a.k) {
                            b.rval2 += val;
                        } else {
                            b.lval2 += val;
                        }
                    }
                }
                a.i += 1;
            }
        }
        //Now expand the size of the proposed pool chart to account for the amount requested from the pool
        //The users liquid chart will be magnified or diminished depending on if the pool has gained or lost coins
        b.amount = (mul((b.poolliquid + b.poolrval),LP)) / LPsupply;
        if(bothsides == true) {
            b.prval = (mul((b.poolrval),LP)) / LPsupply;
            b.plval = (mul((b.poolliquid),LP)) / LPsupply;
        }
        a.i = 0;
        if(a.newtot != b.amount && skip == 0) {            
            while(a.i < (a.pegsteps + a.mk)) {
                if(bothsides == false) {
                    val = (a.reserve[a.i] * b.amount) / a.newtot;
                } else {
                    if(a.i < a.pegsteps) {
                        if(a.i < a.section) {
                            val = (a.reserve[a.i] * b.prval) / b.rval2;
                        } else {
                            val = (a.reserve[a.i] * b.plval) / b.lval2;
                        }
                    } else {
                        if((a.i - a.pegsteps) < a.k) {
                            val = (a.reserve[a.i] * b.prval) / b.rval2;
                        } else {
                            val = (a.reserve[a.i] * b.plval) / b.lval2;
                        }
                    }
                }
                if((b.amount > a.newtot) && magnify == false) {
                    val = a.reserve[a.i];
                }
                a.reserve[a.i] = val;
                a.j += val;
                if(val != 0) {
                    a.highkey = a.i;
                }
                a.i += 1;
            }
            require(b.amount >= a.j, "Too much requested from the pool");
            if(b.amount > a.j) {
                a.reserve[a.highkey] += (b.amount - a.j);
            }
        }
        //We radiate outwards to the limit of the contracts specified precision.
        //The higher the precision the more gas this can consume. This attempts to get the closest match to a users deposit.
        //The quality of the liquidity chart given may entitle them to higher quality liquidity when there are profits.
        a.i = 0;
        a.j = 0;
        val = 0;
        uint[3] memory inx;
        if(skip == 0) {
            while (a.i < (a.pegsteps + a.mk) - 1) {
                if (a.i >= a.section) {
                    if(a.i - a.section < a.mk) {
                        inx[1] = a.pegsteps + (a.i - a.section);
                    } else {
                        inx[1] = (a.i - a.mk) + 1;
                    }
                } else {
                    inx[1] = a.i;
                }
                if (a.reserve[inx[1]] == 0) {
                    a.i += 1;
                    continue;
                }
                a.j = 0;
                while (a.j < precision) { //Here we check for the nearest neighbor that can match our reserve/liquid chart                
                    if (inx[1] >= a.pegsteps) { //This element is within the current section
                        a.k = inx[1] - a.pegsteps;
                        if (a.j > a.k && (a.j - a.k) > a.section) {
                            inx[0] = 0; //Out of bounds on the left side
                        } else {
                            if (a.j > a.k) {
                                inx[0] = a.section - (a.j - a.k);
                            } else {
                                inx[0] = inx[1] - a.j;
                            }
                        }
                        if (a.k + a.j >= a.mk && ((a.k + a.j) - a.mk) + 1 + a.section >= a.pegsteps) {
                            inx[2] = 0; //Out of bounds on the right side
                        } else {
                            if (a.k + a.j >= a.mk) {
                                inx[2] = ((a.k + a.j) - a.mk) + 1 + a.section;
                            } else {
                                inx[2] = inx[1] + a.j;
                            }
                        }
                    } else {
                        if (a.section > inx[1]) {
                            if (a.j > inx[1]) {
                                inx[0] = 0; //Out of bounds on the left side
                            } else {
                                inx[0] = inx[1] - a.j;
                            }
                            if (inx[1] + a.j >= a.section) {
                                if ((inx[1] + a.j) - a.section < a.mk) {
                                    inx[2] = ((inx[1] + a.j) - a.section) + a.pegsteps;
                                } else {
                                    if ((((inx[1] + a.j) - a.section) - a.mk) + 1 + a.section >= a.pegsteps) {
                                        inx[2] = 0; //Out of bounds on the right side
                                    }
                                    inx[2] = (((inx[1] + a.j) - a.section) - a.mk) + 1 + a.section;
                                }
                            } else {
                                inx[2] = inx[1] + a.j;
                            }
                        } else {
                            if (a.j > inx[1] + a.mk - 1) {
                                inx[0] = 0; //Out of bounds on the left side
                            } else {
                                if (a.section + a.j >= inx[1]) {
                                    if ((a.section + a.j) - inx[1] < a.mk) {
                                        inx[0] = ((a.mk - 1) - ((a.section + a.j) - inx[1])) + a.pegsteps; //come in from right hand side
                                    } else {
                                        inx[0] = (inx[1] + (a.mk - 1)) - a.j;
                                    }
                                } else {
                                    inx[0] = inx[1] - a.j;
                                }
                            }
                            if (inx[1] + a.j >= a.pegsteps) {
                                inx[2] = 0; //Out of bounds on the right side
                            } else {
                                inx[2] = inx[1] + a.j;
                            }
                        }
                    }
                    //Here it's possible for more precision to continue to calculate both sides independelty of their gains or losses.
                    //You can subtract from the user and pool Liquid/Reserve totals and at the final step send the remaining proceeds
                    //based on those ratios. This way, when more liquid is gained than reserve it's accurately distributed.
                    if (b.poolreserve[inx[0]] != 0) {
                        if (a.reserve[inx[1]] > b.poolreserve[inx[0]]) {
                            newreserve[inx[0]] += b.poolreserve[inx[0]];
                            a.reserve[inx[1]] -= b.poolreserve[inx[0]];
                            val += b.poolreserve[inx[0]];
                            b.poolreserve[inx[0]] = 0;
                        } else {
                            newreserve[inx[0]] += a.reserve[inx[1]];
                            b.poolreserve[inx[0]] -= a.reserve[inx[1]];
                            val += a.reserve[inx[1]];
                            a.reserve[inx[1]] = 0;
                            break;
                        }
                    }
                    if (b.poolreserve[inx[2]] != 0) {
                        if (a.reserve[inx[1]] > b.poolreserve[inx[2]]) {
                            newreserve[inx[2]] += b.poolreserve[inx[2]];
                            a.reserve[inx[1]] -= b.poolreserve[inx[2]];
                            val += b.poolreserve[inx[2]];
                            b.poolreserve[inx[2]] = 0;
                        } else {
                            newreserve[inx[2]] += a.reserve[inx[1]];
                            b.poolreserve[inx[2]] -= a.reserve[inx[1]];
                            val += a.reserve[inx[1]];
                            a.reserve[inx[1]] = 0;
                            break;
                        }
                    }
                    a.j += 1;
                }
                a.i += 1;
            }
        }
        //If there is anything left over, we just give an equal distribution based on the pools remaining chart.
        if (val < b.amount) { //In future versions of this, you can alternatively calculate "both sides" here as well.
            a.highkey = (b.poolliquid + b.poolrval) - val; //the total left in the pool
            val = b.amount - val;
            a.i = 0;
            a.newtot = 0;
            while (a.i < a.mk) {
                a.liquid = mul(b.poolreserve[a.pegsteps + a.i],val) / a.highkey;
                b.poolreserve[a.pegsteps + a.i] -= a.liquid;
                newreserve[a.pegsteps + a.i] += a.liquid;
                a.newtot += a.liquid;
                a.i += 1;
            }
            a.i = 0; //We iterate liquid and reserve
            while (a.i < a.pegsteps) {
                a.liquid = mul(b.poolreserve[a.i],val) / a.highkey;
                b.poolreserve[a.i] -= a.liquid;
                newreserve[a.i] += a.liquid;
                a.newtot += a.liquid;
                a.i += 1;
            }
            a.highkey = sub(val, a.newtot); //remainder
            a.i = 0;
            while (a.i < a.mk) {
                if (a.highkey == 0) {
                    break;
                }
                if (b.poolreserve[a.pegsteps + a.i] > 0) {
                    b.poolreserve[a.pegsteps + a.i] -= 1;
                    newreserve[a.pegsteps + a.i] += 1;
                    a.highkey -= 1;
                }                
                a.i += 1;
            }
            a.i = 0;
            while (a.i < a.pegsteps) {
                if (a.highkey == 0) {
                    break;
                }
                if (b.poolreserve[a.i] > 0) {
                    b.poolreserve[a.i] -= 1;
                    newreserve[a.i] += 1;
                    a.highkey -= 1;
                }                
                a.i += 1;
            }
            require(a.highkey == 0, "Calculation error");
        }
        //b.amount is amount taken from pool
        //newreserve is the chart taken from pool
        //b.difference is what is taken from a users pool based on the percent of LP tokens taken
        return (b.amount, newreserve, b.difference);
    }
}
//This pooling method lets users share liquid for a "smoother deflation". They first check to see if there is enough liquid
//funds, if not they take the most premium reserve they can. Then, they take the pools pattern. Then they check to see if
//there is enough reserve and if not take from liquid and finally they try to find the "best match" for the reserve sections.
//Careful, this function might get expensive. It's useful for a user to check gas cost of recipient/sender balances in advance.
//This function is not necessarily for AMM exchanges. It's used to illustrate how to give all users a predictable deflation.
//Therefore, this function is only shown as an example and it has not been audited or tested yet.
//function calculatePoolBalanceV2(address user, address pool, uint buffer) public view returns (uint, uint, uint[38] memory) {
//    calcLocals memory a;
//    uint deflationrate;
//    bool success;
//    bytes memory result;
//    (success, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
//    (a.supply,a.pegsteps,a.mk,a.pegrate,deflationrate) = abi.decode(result, (uint,uint,uint,uint,uint));
//    if (buffer != 0) {
//        //To check supply at 0 just add liquid + reserve balances
//        a.supply = buffer;
//    }
//    (a.liquid, a.rval, a.reserve) = calculateBalance(user,pool,false,buffer);
//    (uint poolliquid, uint poolrval, uint[38] memory poolreserve) = calculateBalance(msg.sender,pool,true,buffer);
//    a.section = (a.supply / a.mk);
//    a.i = 0;
//    a.k = a.supply % a.mk;
//    
//    uint val;
//    uint[38] memory newreserve;
//    //First compare two balances, if user is owed L they get reserve starting from right to left
//    if (a.liquid > poolliquid) { //There isn't enough liquid, so we take from reserve
//        val = a.liquid - poolliquid;
//        a.liquid -= val;
//        poolrval -= val; //There must be funds here if not in liquid pool
//        while (a.i < a.k) {
//            a.i += 1; //add first because we want reserve only
//            if (poolreserve[a.pegsteps + a.k - a.i] < val) {
//                newreserve[a.pegsteps + a.k - a.i] += poolreserve[a.pegsteps + a.k - a.i];
//                val -= poolreserve[a.pegsteps + a.k - a.i];
//                poolreserve[a.pegsteps + a.k - a.i] = 0;
//            } else {
//                newreserve[a.pegsteps + a.k - a.i] += val;
//                poolreserve[a.pegsteps + a.k - a.i] -= val;
//                val = 0;
//                break;
//            }
//        }
//        a.i = 0;
//        if (val > 0) {                
//            while (a.i < a.section) {
//                a.i += 1;
//                if (poolreserve[a.section - a.i] < val) {
//                    newreserve[a.section - a.i] += poolreserve[a.section - a.i];
//                    val -= poolreserve[a.section - a.i];
//                    poolreserve[a.section - a.i] = 0;
//                } else {
//                    newreserve[a.section - a.i] += val;
//                    poolreserve[a.section - a.i] -= val;
//                    val = 0;
//                    break;
//                }
//            }
//        }
//        require(val == 0, "Pool is missing funds");
//    }
//    //Now take an even ratio from the pool since it's shared.
//    uint remainder = 0;
//    if (a.liquid > 0) {
//        a.i = 0;
//        val = a.liquid;
//        a.liquid = 0;
//        a.newtot = 0;
//        while (a.i < a.mk - a.k) {
//            a.liquid = mul(poolreserve[a.pegsteps + a.k + a.i],val) / poolliquid;
//            poolreserve[a.pegsteps + a.k + a.i] -= a.liquid;
//            newreserve[a.pegsteps + a.k + a.i] += a.liquid;
//            a.newtot += a.liquid;
//            a.i += 1;
//        }
//        a.i = a.section + 1;
//        while (a.i < a.pegsteps) {
//            a.liquid = mul(poolreserve[a.i],val) / poolliquid;
//            poolreserve[a.i] -= a.liquid;
//            newreserve[a.i] += a.liquid;
//            a.newtot += a.liquid;
//            a.i += 1;
//        }
//        remainder = sub(val, a.newtot);
//        a.i = 0;
//        while (a.i < a.mk - a.k) {
//            if (remainder == 0) {
//                break;
//            }
//            if (poolreserve[a.pegsteps + a.k + a.i] > 0) {
//                poolreserve[a.pegsteps + a.k + a.i] -= 1;
//                newreserve[a.pegsteps + a.k + a.i] += 1;
//                remainder -= 1;
//                a.newtot += 1;
//            }
//            a.i += 1;
//        }
//        a.i = a.section + 1;
//        while (a.i < a.pegsteps) {
//            if (remainder == 0) {
//                break;
//            }
//            if (poolreserve[a.i] > 0) {
//                poolreserve[a.i] -= 1;
//                newreserve[a.i] += 1;
//                remainder -= 1;
//                a.newtot += 1;
//            }
//            a.i += 1;
//        }
//        require(remainder == 0, "Calculation error");
//        require(a.newtot == val, "Value mismatch");
//        poolliquid -= val;
//    }
//    //First check to see if there is enough reserve in the pool, if not take from liquid side
//    //Also we remove some of what is owed from the previous reserve pool since we look for the best match after
//    if (a.rval > poolrval) {
//        a.i = 0;
//        val = a.rval - poolrval;            
//        poolliquid -= val;
//        while (a.i < (a.mk - a.k)) {
//            if (poolreserve[a.pegsteps + a.k + a.i] < val) {
//                newreserve[a.pegsteps + a.k + a.i] += poolreserve[a.pegsteps + a.k + a.i];
//                val -= poolreserve[a.pegsteps + a.k + a.i];
//                poolreserve[a.pegsteps + a.k + a.i] = 0;
//            } else {
//                newreserve[a.pegsteps + a.k + a.i] += val;
//                poolreserve[a.pegsteps + a.k + a.i] -= val;
//                val = 0;
//                break;
//            }
//            a.i += 1;
//        }
//        a.i = 0;
//        if (val > 0) {                
//            while (a.i < a.pegsteps - (a.section + 1)) {
//                a.i += 1;
//                if (poolreserve[a.section + a.i] < val) {
//                    newreserve[a.section + a.i] += poolreserve[a.section + a.i];
//                    val -= poolreserve[a.section + a.i];
//                    poolreserve[a.section + a.i] = 0;
//                } else {
//                    newreserve[a.section + a.i] += val;
//                    poolreserve[a.section + a.i] -= val;
//                    val = 0;
//                    break;
//                }                    
//            }
//        }
//        require(val == 0, "Pool is missing funds");
//        val = a.rval - poolrval;
//        a.rval -= val;
//        a.i = 0;
//        while (a.i < a.k) {
//            a.i += 1;
//            if (a.reserve[a.pegsteps + a.k - a.i] < val) {
//                val -= a.reserve[a.pegsteps + a.k - a.i];
//                a.reserve[a.pegsteps + a.k - a.i] = 0;
//            } else {
//                a.reserve[a.pegsteps + a.k - a.i] -= val;
//                val = 0;
//                break;
//            }                
//        }
//        a.i = 0;
//        if (val > 0) {                
//            while (a.i < a.section) {
//                a.i += 1;
//                if (a.reserve[a.section - a.i] < val) {
//                    val -= a.reserve[a.section - a.i];
//                    a.reserve[a.section - a.i] = 0;
//                } else {
//                    a.reserve[a.section - a.i] -= val;
//                    val = 0;
//                    break;
//                }
//            }
//        }
//        require(val == 0, "Reserve section is missing funds");
//    }
//    //Great, now we just have to match the reserve as closely as possible. A lot of iterations are possible here.
//    a.i = 0;
//    uint[3] memory inx;
//    while (a.i < (a.section + a.k)) {
//        if (a.i >= a.section) {
//            inx[1] = a.pegsteps + (a.i - a.section);
//        } else {
//            inx[1] = a.i;
//        }
//        if (a.reserve[inx[1]] == 0) {
//            a.i += 1;
//            continue;
//        }
//        a.j = 0;
//        while (a.j < a.pegsteps + a.mk) { //Here we check for the nearest neighbor that can match our reserve deposit
//            if (inx[1] >= a.pegsteps) {
//                 val = inx[1] - a.pegsteps;
//                if (a.j > val && (a.j - val) > a.section) {
//                    inx[0] = 0; //Out of bounds
//                } else {
//                    if (a.j > val) {
//                        inx[0] = a.section - (a.j - val);
//                    } else {
//                        inx[0] = inx[1] - a.j;
//                    }
//                }
//                if (val + a.j >= a.mk && ((val + a.j) - a.mk) + 1 + a.section >= a.pegsteps) {
//                    inx[2] = 0; //Out of bounds
//                } else {
//                    if (val + a.j >= a.mk) {
//                        inx[2] = ((val + a.j) - a.mk) + 1 + a.section;
//                    } else {
//                        inx[2] = inx[1] + a.j;
//                    }
//                }
//            } else {
//                if (a.j > inx[1]) {
//                    inx[0] = 0; //Out of bounds
//                } else {
//                    inx[0] = inx[1] - a.j;
//                }
//                if (inx[1] + a.j >= a.section) {
//                    if ((inx[1] + a.j) - a.section < a.mk) {
//                        inx[2] = ((inx[1] + a.j) - a.section) + a.pegsteps;
//                    } else {
//                        if ((((inx[1] + a.j) - a.section) - a.mk) + 1 + a.section >= a.pegsteps) {
//                            inx[2] = 0; //Out of bounds
//                        }
//                        inx[2] = (((inx[1] + a.j) - a.section) - a.mk) + 1 + a.section;
//                    }
//                } else {
//                    inx[2] = inx[1] + a.j;
//                }
//            }
//            if (poolreserve[inx[0]] != 0) {
//               if (a.reserve[inx[1]] > poolreserve[inx[0]]) {
//                    newreserve[inx[0]] += poolreserve[inx[0]];
//                    a.reserve[inx[1]] -= poolreserve[inx[0]];
//                    poolreserve[inx[0]] = 0;
//                } else {
//                    newreserve[inx[0]] += a.reserve[inx[1]];
//                    poolreserve[inx[0]] -= a.reserve[inx[1]];
//                    a.reserve[inx[1]] = 0;
//                    break;
//                }
//            }
//            if (poolreserve[inx[2]] != 0) {
//                if (a.reserve[inx[1]] > poolreserve[inx[2]]) {
//                    newreserve[inx[2]] += poolreserve[inx[2]];
//                    a.reserve[inx[1]] -= poolreserve[inx[2]];
//                    poolreserve[inx[2]] = 0;
//                } else {
//                    newreserve[inx[2]] += a.reserve[inx[1]];
//                    poolreserve[inx[2]] -= a.reserve[inx[1]];
//                    a.reserve[inx[1]] = 0;
//                    break;
//                }
//            }
//            a.j += 1;
//        }
//        a.i += 1;
//    }
//    //Calculate balance of new pool
//    a.i = 0;
//    a.liquid = 0;
//    a.rval = 0;
//    while (a.i < a.pegsteps) {
//        if (a.i < a.section) {
//            a.rval += newreserve[a.i];
//        }
//        if (a.i > a.section) {
//            a.liquid += newreserve[a.i];
//        }
//        a.i += 1;
//    }
//    a.i = 0;
//    while (a.i < a.mk) {
//        if (a.i < a.k) {
//            a.rval += newreserve[a.pegsteps + a.i];
//        }
//        if (a.i >= a.k) {
//            a.liquid += newreserve[a.pegsteps + a.i];
//        }
//        a.i += 1;
//    }
//    return (a.liquid, a.rval, newreserve);
//}