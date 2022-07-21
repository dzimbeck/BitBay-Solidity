pragma solidity =0.6.6;

interface IUniswapV2Factory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);

    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function createPair(address tokenA, address tokenB) external returns (address pair);

    function setFeeTo(address) external;
    function setFeeToSetter(address) external;
}

interface IUniswapV2Pair {
    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function name() external pure returns (string memory);
    function symbol() external pure returns (string memory);
    function decimals() external pure returns (uint8);
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function PERMIT_TYPEHASH() external pure returns (bytes32);
    function nonces(address owner) external view returns (uint);

    function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external;

    event Mint(address indexed sender, uint amount0, uint amount1);
    event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    function MINIMUM_LIQUIDITY() external pure returns (uint);
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function price0CumulativeLast() external view returns (uint);
    function price1CumulativeLast() external view returns (uint);
    function kLast() external view returns (uint);

    function mint(address to) external returns (uint liquidity);
    function burn(address to) external returns (uint amount0, uint amount1);
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;
    function skim(address to) external;
    function sync() external;

    function initialize(address, address) external;
}

interface IUniswapV2Router01 {
    function addLiquidity(
        address[2] calldata tokenAB,
        uint[2] calldata amountABDesired,
        uint Liquid,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        address factory
    ) external returns (uint amountA, uint amountB, uint liquidity);
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint Liquid,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        address factory
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        address factory
    ) external returns (uint amountA, uint amountB);
    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        address factory
    ) external returns (uint amountToken, uint amountETH);
    function removeLiquidityWithPermit(
        address[2] calldata tokenAB,
        uint liquidity,
        uint[2] calldata amountABMin,
        address to,
        uint deadline,
        address factory,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external returns (uint amountA, uint amountB);
    function removeLiquidityETHWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        address factory,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external returns (uint amountToken, uint amountETH);
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,        
        uint deadline,
        address factory
    ) external returns (uint[] memory amounts);
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline,
        address factory
    ) external returns (uint[] memory amounts);
    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline, address factory)
        external
        payable
        returns (uint[] memory amounts);
    function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline, address factory)
        external
        returns (uint[] memory amounts);
    function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline, address factory)
        external
        returns (uint[] memory amounts);
    function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline, address factory)
        external
        payable
        returns (uint[] memory amounts);

    function quote(uint amountA, uint reserveA, uint reserveB) external pure returns (uint amountB);
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) external view returns (uint amountOut);
    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) external view returns (uint amountIn);
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
    function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts);
}

interface IERC20 {
    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
}

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint value) external returns (bool);
    function withdraw(uint) external;
}

interface IBitBay {
    function changeVars(uint256,uint256,address,address,address) external returns (bool);
}

interface ILiquidityPool {
    function addLPTokens(address,address,uint256) external;
}

contract UniswapV2Router02 is IUniswapV2Router01 {
    using SafeMath for uint;

    address public factory;
    mapping (address => bytes) INIT_CODE;
    mapping (address => bool) INIT_FILLED;
    mapping (address => address) WETH;
    mapping (address => uint) numerators;
    mapping (address => uint) feenum;
    mapping (address => uint) feeden;

    //bytes public constant INIT_CODE = hex'e1f8c2f058bd6b94d979958a2ee8fbf8d7f33d32b7e27e3d93fc7c89f833b576';

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'EXPIRED');
        _;
    }

    address public minter;
    //To save on contract size, can get the variables from showProxies
    address BAY;
    address BAYR;
    address LiquidityPool;
    address proxyBAY;
    mapping (address => bool) isProxy;
    bool locked;

    uint[30] fairRatio;
    uint pegrate = 95;
    uint pegsteps = 30;
    uint deflationrate = 99;
    uint microsteps = 8;
    uint totalSupply = 1e17;
    
    bool public enforcePoolRatio = true;
    uint public resTolerance = 125;
    uint public liqTolerance = 125; //Recommended 25% fault tolerance

    struct myLocals {
        uint[38] reserve;
        bool success;
        bytes result;
        uint i;
        uint rval;
        uint liquid;
        uint supply;
        uint pegsteps;
        uint mk;        
        uint pegrate;
        uint deflationrate;
    }

    struct myLocals2 {
        bool success;
        bytes result;
        uint rvar;
        uint lvar;
        uint res;
        address pair;
    }

    struct locals2 {
        bool success;
        bytes result;
        address feeTo;
        address token0;
        uint liq2;
    }

    constructor(address _factory, address _WETH, address _minter, bytes memory init, uint mynumerator, uint fnum, uint fden) public {
        factory = _factory;
        INIT_CODE[factory] = init;
        INIT_FILLED[factory] = true;
        WETH[factory] = _WETH;
        numerators[factory] = mynumerator; //UniSwap is 997, PancakeSwap is 998
        feenum[factory] = fnum; //UniSwap is 1, PancakeSwap is 8
        feeden[factory] = fden; //UniSwap is 5, PancakeSwap is 17
        minter = _minter;
        setRatio();
    }

    receive() external payable {
        assert(msg.sender == WETH[factory]); // only accept ETH via fallback from the WETH contract
    }
    
    function changeProxy(address _BAY, address _BAYR, address _LiquidityPool, address _proxyBAY) public {
        require(msg.sender == minter);
        require(LiquidityPool == address(0)); //These variables can only be set once, for updates make a new router
        BAY = _BAY;
        isProxy[BAY] = true;
        BAYR = _BAYR;
        isProxy[BAYR] = true;
        LiquidityPool = _LiquidityPool;
        proxyBAY = _proxyBAY;
    }

    function showProxies() public view returns(address, address, address, address) {
        return (BAY, BAYR, LiquidityPool, proxyBAY);
    }

    function showfactory(address fact) public view returns(bytes memory, bool, address, uint, uint, uint) {
        return (INIT_CODE[fact], INIT_FILLED[fact], WETH[fact], numerators[fact], feenum[fact], feeden[fact]);
    }

    function changeFactory(address myfactory, address myWETH, bytes memory init, uint mynumerator, uint fnum, uint fden) public {        
        require(msg.sender == minter);
        if(!INIT_FILLED[myfactory]) {
            WETH[myfactory] = myWETH;
            INIT_CODE[myfactory] = init;
            INIT_FILLED[myfactory] = true;
            numerators[myfactory] = mynumerator;
            feenum[myfactory] = fnum;
            feeden[myfactory] = fden;
        }
    }

    function enforceRatio(bool status, uint toleranceL, uint toleranceR) public {
        require(msg.sender == minter);
        enforcePoolRatio = status;
        resTolerance = toleranceR;
        liqTolerance = toleranceL;
    }

    function setRatio() private {
        uint i;
        uint j;
        uint newtot = totalSupply;
        uint liquid;
        uint temp;
        uint mk = microsteps;
        while(i < pegsteps) {
            j=0;
            temp=0;
            while (j < mk) {
                liquid = newtot - (newtot * (deflationrate ** (100 - pegrate))) / (100 **  (100 - pegrate)); //Use safe math here?!
                newtot -= liquid;
                temp += liquid;
                j += 1;
            }
            fairRatio[i] = temp;
            i += 1;
        }
    }

    function donateLiquidity(address pair, uint amount, uint BAY_BAYR) public {
        require(!locked);
        locked = true;
        address path = address(0);
        if(BAY_BAYR == 0) {
            path = BAY;
        }
        if(BAY_BAYR == 1) {
            path = BAYR;
        }
        unlockBAYvars(path);
        TransferHelper.safeTransferFrom(path, msg.sender, pair, amount);
        locked = false;
    }

    //One additional way to compare liquidity is by comparing/rating charts. To do so, you can multiply each shard by
    //a fraction of the shard on the opposite side of the chart of what is given during newly minted coins. That essentially
    //corrects the deflation and gives highly deflated coins a corrected value representing their strength.
    function checkLiquidity(address proxytoken, uint liquidDesired, uint amountDesired, uint amount, uint[38] memory poolreserve, uint section) public view returns(bool) {
        if(amount != amountDesired) {
            liquidDesired = (liquidDesired.mul(amount)) / amountDesired;
        }
        require(liquidDesired <= amount);
        uint x = 0;
        uint[4] memory tot;
        while(x < microsteps) {
            tot[0] += poolreserve[pegsteps + x];
            poolreserve[pegsteps + x] = 0;
            x += 1;
        }
        poolreserve[section] = tot[0];
        tot[0] = 0;
        x = 0;
        while(x < pegsteps) {
            if(x < section) {
                tot[1] += fairRatio[x];
                tot[3] += poolreserve[x];
            }
            if(x == section) {
                if(proxytoken == BAYR) {
                    tot[1] += fairRatio[x];
                    tot[3] += poolreserve[x];
                } else {
                    tot[0] += fairRatio[x];
                    tot[2] += poolreserve[x];
                }
            }
            if(x > section) {
                tot[0] += fairRatio[x];
                tot[2] += poolreserve[x];
            }
            x += 1;
        }        
        if(proxytoken == BAYR) {
            Math.compareFractions((liquidDesired * liqTolerance) / 100, amount, tot[0], tot[0]+tot[1]);
            if (enforcePoolRatio) {
                Math.compareFractions((liquidDesired * liqTolerance) / 100, amount, tot[2], tot[2]+tot[3]);
            }
        } else {
            Math.compareFractions(((amount - liquidDesired) * resTolerance) / 100, amount, tot[1], tot[0]+tot[1]);
            if (enforcePoolRatio) {
                Math.compareFractions(((amount - liquidDesired) * resTolerance) / 100, amount, tot[3], tot[2]+tot[3]);
            }
        }
        return true;
    }


    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint Liquid,
        uint amountAMin,
        uint amountBMin
    ) internal virtual returns (uint amountA, uint amountB) {
        require(Liquid >= 0);
        // create the pair if it doesn't exist yet
        address addy = IUniswapV2Factory(factory).getPair(tokenA, tokenB);
        myLocals memory a;
        if (addy == address(0)) {
            addy = IUniswapV2Factory(factory).createPair(tokenA, tokenB);
        }
        regBalance(addy);
        
        (uint reserveA, uint reserveB) = UniswapV2Library.getReserves(factory, tokenA, tokenB, INIT_CODE[factory]);        
        (a.success, a.result) = LiquidityPool.staticcall(abi.encodeWithSignature("calculateBalance(address,address,bool,uint256)",addy,addy,true,0));
        require(a.success);
        (a.liquid, a.rval, a.reserve) = abi.decode(a.result, (uint,uint,uint[38]));
        (a.success, a.result) = proxyBAY.staticcall(abi.encodeWithSignature("getState()"));
        (a.supply,a.pegsteps,a.mk,a.pegrate,a.deflationrate) = abi.decode(a.result, (uint,uint,uint,uint,uint));
        if(isProxy[tokenA]) {
            reserveA = a.liquid + a.rval;
        }
        if(isProxy[tokenB]) {
            reserveB = a.liquid + a.rval;
        }

        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = UniswapV2Library.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'INSUFFICIENT_B');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = UniswapV2Library.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'INSUFFICIENT_A');
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
        if(isProxy[tokenA]) {
            require(checkLiquidity(tokenA, Liquid, amountADesired, amountA, a.reserve, (a.supply / a.mk)));
        } else {
            require(checkLiquidity(tokenB, Liquid, amountBDesired, amountB, a.reserve, (a.supply / a.mk)));
        }
    }

    function addLiquidity(
        address[2] calldata tokenAB,
        uint[2] calldata amountABDesired,
        uint Liquid,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        address fact
    ) external virtual override ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;
        factory = fact;
        (amountA, amountB) = _addLiquidity(tokenAB[0], tokenAB[1], amountABDesired[0], amountABDesired[1], Liquid, amountAMin, amountBMin);
        myLocals2 memory a;
        a.pair = UniswapV2Library.pairFor(factory, tokenAB[0], tokenAB[1], INIT_CODE[factory]);
        require(isProxy[tokenAB[0]] || isProxy[tokenAB[1]]);
        if (isProxy[tokenAB[0]] && isProxy[tokenAB[1]]) {
            require(false);
        }        
        if (isProxy[tokenAB[0]]) {
            if(amountA != amountABDesired[0]) {
                Liquid = (Liquid.mul(amountA)) / amountABDesired[0];
            }
            if(Liquid > 0) {
                a.lvar = 1;
            }
            a.res = amountA.sub(Liquid);
            if(a.res > 0) {
                a.rvar = 1;
            }
            require(a.res > 0 || Liquid > 0);
            require(IBitBay(proxyBAY).changeVars(a.lvar,a.rvar,to,address(0),address(0)));
            if(Liquid > 0) {
                TransferHelper.safeTransferFrom(BAY, msg.sender, a.pair, Liquid);
            }
            if(a.res > 0) {
                TransferHelper.safeTransferFrom(BAYR, msg.sender, a.pair, a.res);
            }            
            TransferHelper.safeTransferFrom(tokenAB[1], msg.sender, a.pair, amountB);
        }
        if (isProxy[tokenAB[1]]) {
            if(amountB != amountABDesired[1]) {
                Liquid = (Liquid.mul(amountB)) / amountABDesired[1];
            }
            if(Liquid > 0) {
                a.lvar = 1;
            }
            a.res = amountB.sub(Liquid);
            if(a.res > 0) {
                a.rvar = 1;
            }
            require(a.res > 0 || Liquid > 0);
            require(IBitBay(proxyBAY).changeVars(a.lvar,a.rvar,to,address(0),address(0)));
            if(Liquid > 0) {
                TransferHelper.safeTransferFrom(BAY, msg.sender, a.pair, Liquid);
            }
            if(a.res > 0) {
                TransferHelper.safeTransferFrom(BAYR, msg.sender, a.pair, a.res);
            }
            TransferHelper.safeTransferFrom(tokenAB[0], msg.sender, a.pair, amountA);
        }
        (uint liq2, address feeTo) = mintLib.mintFee(a.pair, factory, feenum[factory], feeden[factory]);
        if(liq2 != 0) {
            ILiquidityPool(LiquidityPool).addLPTokens(feeTo,a.pair,liq2);
        }
        liquidity = IUniswapV2Pair(a.pair).mint(to);
        ILiquidityPool(LiquidityPool).addLPTokens(to,a.pair,liquidity);
        locked = false;
    }
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint Liquid,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        address fact
    ) external virtual override payable ensure(deadline) returns (uint amountToken, uint amountETH, uint liquidity) {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;
        factory = fact;
        myLocals2 memory a;
        (amountToken, amountETH) = _addLiquidity(
            token,
            WETH[factory],
            amountTokenDesired,
            Liquid,
            msg.value,
            amountTokenMin,
            amountETHMin
        );
        a.pair = UniswapV2Library.pairFor(factory, token, WETH[factory], INIT_CODE[factory]);
        require(isProxy[token]);
        if(amountToken != amountTokenDesired) {
            Liquid = (Liquid.mul(amountToken)) / amountTokenDesired;
        }
        if(Liquid > 0) {
            a.lvar = 1;
        }
        a.res = amountToken.sub(Liquid);
        if(a.res > 0) {
            a.rvar = 1;
        }
        require(a.res > 0 || Liquid > 0);
        require(IBitBay(proxyBAY).changeVars(a.lvar,a.rvar,to,address(0),address(0)));
        if(Liquid > 0) {
            TransferHelper.safeTransferFrom(BAY, msg.sender, a.pair, Liquid);
        }
        if(a.res > 0) {
            TransferHelper.safeTransferFrom(BAYR, msg.sender, a.pair, a.res);
        }
        IWETH(WETH[factory]).deposit{value: amountETH}();
        assert(IWETH(WETH[factory]).transfer(a.pair, amountETH));
        (uint liq2, address feeTo) = mintLib.mintFee(a.pair, factory, feenum[factory], feeden[factory]);
        if(liq2 != 0) {
            ILiquidityPool(LiquidityPool).addLPTokens(feeTo,a.pair,liq2);
        }
        liquidity = IUniswapV2Pair(a.pair).mint(to);
        ILiquidityPool(LiquidityPool).addLPTokens(to,a.pair,liquidity);
        // refund dust eth, if any
        if (msg.value > amountETH) TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
        locked = false;
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        address fact
    ) public virtual override ensure(deadline) returns (uint amountA, uint amountB) {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;
        factory = fact;        
        address pair = UniswapV2Library.pairFor(factory, tokenA, tokenB, INIT_CODE[factory]);
        regBalance(pair);
        IUniswapV2Pair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        locals2 memory a;
        (a.liq2, a.feeTo) = mintLib.mintFee(pair, factory, feenum[factory], feeden[factory]);
        if(a.liq2 != 0) {
            ILiquidityPool(LiquidityPool).addLPTokens(a.feeTo,pair,a.liq2);
        }
        require(IBitBay(proxyBAY).changeVars(liquidity,0,msg.sender,pair,address(this)));
        (uint amount0, uint amount1) = IUniswapV2Pair(pair).burn(to);
        regBalance(pair);
        (a.token0,) = UniswapV2Library.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == a.token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, 'INSUFFICIENT_A');
        require(amountB >= amountBMin, 'INSUFFICIENT_B');
        if(to != address(this)) {
            a.liq2 = IERC20(BAY).balanceOf(address(this));
            if(a.liq2 > 0) {
                TransferHelper.safeTransfer(BAY, to, a.liq2);
            }
            a.liq2 = IERC20(BAYR).balanceOf(address(this));
            if(a.liq2 > 0) {
                TransferHelper.safeTransfer(BAYR, to, a.liq2);
            }
        }
        locked = false;
    }
    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        address fact
    ) public virtual override ensure(deadline) returns (uint amountToken, uint amountETH) {
        (amountToken, amountETH) = removeLiquidity(
            token,
            WETH[fact],
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline,
            fact
        );
        require(!locked);
        locked = true;
        uint i = IERC20(BAY).balanceOf(address(this));
        if(i > 0) {
            TransferHelper.safeTransfer(BAY, to, i);
        }
        i = IERC20(BAYR).balanceOf(address(this));
        if(i > 0) {
            TransferHelper.safeTransfer(BAYR, to, i);
        }
        IWETH(WETH[factory]).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
        locked = false;
    }
    function removeLiquidityWithPermit(
        address[2] calldata tokenAB,
        uint liquidity,
        uint[2] calldata amountABMin,
        address to,
        uint deadline,
        address fact,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountA, uint amountB) {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;
        factory = fact;
        myLocals2 memory a;
        a.pair = UniswapV2Library.pairFor(factory, tokenAB[0], tokenAB[1], INIT_CODE[factory]);
        a.lvar = approveMax ? uint(-1) : liquidity;
        IUniswapV2Pair(a.pair).permit(msg.sender, address(this), a.lvar, deadline, v, r, s);
        locked = false;
        (amountA, amountB) = removeLiquidity(tokenAB[0], tokenAB[1], liquidity, amountABMin[0], amountABMin[1], to, deadline, fact);
    }
    function removeLiquidityETHWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        address fact,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountToken, uint amountETH) {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;
        factory = fact;
        address pair = UniswapV2Library.pairFor(factory, token, WETH[factory], INIT_CODE[factory]);
        uint value = approveMax ? uint(-1) : liquidity;
        IUniswapV2Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        locked = false;
        (amountToken, amountETH) = removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to, deadline, fact);
    }

    function unlockBAYvars(address path) private {
        bool success;
        if(isProxy[path]) { //A deposit is detected, let's distinguish from a LP deposit
            if(path == BAY) {
                success = IBitBay(proxyBAY).changeVars(2,0,address(0),address(0),address(0));
            }
            if(path == BAYR) {
                success = IBitBay(proxyBAY).changeVars(0,2,address(0),address(0),address(0));
            }
            require(success);
        }
    }
    function regBalance(address pair) private {
        bool success;
        bytes memory result;        
        (success, result) = LiquidityPool.call(abi.encodeWithSignature("LPbalance(address)",pair));
        require(success);       
    }
    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(uint[] memory amounts, address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = UniswapV2Library.sortTokens(input, output);
            uint amountOut = amounts[i + 1];
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
            address to = i < path.length - 2 ? UniswapV2Library.pairFor(factory, output, path[i + 2], INIT_CODE[factory]) : _to;
            address pair = UniswapV2Library.pairFor(factory, input, output, INIT_CODE[factory]);
            regBalance(pair);
            IUniswapV2Pair(pair).swap(
                amount0Out, amount1Out, to, new bytes(0)
            );
        }
    }
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline,
        address fact
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;
        factory = fact;
        amounts = UniswapV2Library.getAmountsOut(factory, amountIn, path, INIT_CODE[factory], numerators[factory]);
        require(amounts[amounts.length - 1] >= amountOutMin, 'INSUFFICIENT_OUT');
        unlockBAYvars(path[0]);
        address pair = UniswapV2Library.pairFor(factory, path[0], path[1], INIT_CODE[factory]);
        regBalance(pair);
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, pair, amounts[0]
        );
        _swap(amounts, path, to);
        locked = false;
    }
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline,
        address fact
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;
        factory = fact;        
        amounts = UniswapV2Library.getAmountsIn(factory, amountOut, path, INIT_CODE[factory], numerators[factory]);
        require(amounts[0] <= amountInMax, 'EXCESSIVE_IN');
        unlockBAYvars(path[0]);
        address pair = UniswapV2Library.pairFor(factory, path[0], path[1], INIT_CODE[factory]);
        regBalance(pair);
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, pair, amounts[0]
        );
        _swap(amounts, path, to);
        locked = false;
    }
    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline, address fact)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;        
        factory = fact;
        require(path[0] == WETH[factory]);
        amounts = UniswapV2Library.getAmountsOut(factory, msg.value, path, INIT_CODE[factory], numerators[factory]);
        require(amounts[amounts.length - 1] >= amountOutMin, 'INSUFFICIENT_OUT');
        IWETH(WETH[factory]).deposit{value: amounts[0]}();
        assert(IWETH(WETH[factory]).transfer(UniswapV2Library.pairFor(factory, path[0], path[1], INIT_CODE[factory]), amounts[0]));
        _swap(amounts, path, to);
        locked = false;
    }
    function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline, address fact)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;        
        factory = fact;
        require(path[path.length - 1] == WETH[factory]);
        amounts = UniswapV2Library.getAmountsIn(factory, amountOut, path, INIT_CODE[factory], numerators[factory]);
        require(amounts[0] <= amountInMax, 'EXCESSIVE_IN');
        unlockBAYvars(path[0]);
        address pair = UniswapV2Library.pairFor(factory, path[0], path[1], INIT_CODE[factory]);
        regBalance(pair);
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, pair, amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH[factory]).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
        locked = false;
    }
    function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline, address fact)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;
        factory = fact;        
        require(path[path.length - 1] == WETH[factory]);
        amounts = UniswapV2Library.getAmountsOut(factory, amountIn, path, INIT_CODE[factory], numerators[factory]);
        require(amounts[amounts.length - 1] >= amountOutMin, 'INSUFFICIENT_OUT');
        unlockBAYvars(path[0]);
        address pair = UniswapV2Library.pairFor(factory, path[0], path[1], INIT_CODE[factory]);
        regBalance(pair);
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, pair, amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH[factory]).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
        locked = false;
    }
    function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline, address fact)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(INIT_FILLED[fact] != false);
        require(!locked);
        locked = true;
        factory = fact;        
        require(path[0] == WETH[factory]);
        amounts = UniswapV2Library.getAmountsIn(factory, amountOut, path, INIT_CODE[factory], numerators[factory]);
        require(amounts[0] <= msg.value, 'EXCESSIVE_IN');
        IWETH(WETH[factory]).deposit{value: amounts[0]}();
        assert(IWETH(WETH[factory]).transfer(UniswapV2Library.pairFor(factory, path[0], path[1], INIT_CODE[factory]), amounts[0]));
        _swap(amounts, path, to);
        // refund dust eth, if any
        if (msg.value > amounts[0]) TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
        locked = false;
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(uint amountA, uint reserveA, uint reserveB) public pure virtual override returns (uint amountB) {
        return UniswapV2Library.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        public
        view
        virtual
        override
        returns (uint amountOut)
    {
        return UniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut, numerators[factory]);
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut)
        public
        view
        virtual
        override
        returns (uint amountIn)
    {
        return UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut, numerators[factory]);
    }

    function getAmountsOut(uint amountIn, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return UniswapV2Library.getAmountsOut(factory, amountIn, path, INIT_CODE[factory], numerators[factory]);
    }

    function getAmountsIn(uint amountOut, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return UniswapV2Library.getAmountsIn(factory, amountOut, path, INIT_CODE[factory], numerators[factory]);
    }
}

// a library for performing overflow-safe math, courtesy of DappHub (https://github.com/dapphub/ds-math)

library SafeMath {
    function add(uint x, uint y) internal pure returns (uint z) {
        require((z = x + y) >= x, 'ds-math-add-overflow');
    }

    function sub(uint x, uint y) internal pure returns (uint z) {
        require((z = x - y) <= x, 'ds-math-sub-underflow');
    }

    function mul(uint x, uint y) internal pure returns (uint z) {
        require(y == 0 || (z = x * y) / y == x, 'ds-math-mul-overflow');
    }
}

// a library for performing various math operations
library Math {
    // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
    function sqrt(uint y) internal pure returns (uint z) {
        if (y > 3) {
            z = y;
            uint x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }    
    function compareFractions(uint num1, uint den1, uint num2, uint den2) internal pure {
        require(num1 * den2 >= num2 * den1);
    }
}

library mintLib {
    using SafeMath for uint;
    
    struct locals {
        uint rootK;
        uint rootKLast;
        uint numerator;
        uint denominator;
    }
    
    function mintFee(address pair, address factory, uint mynum, uint myden) public view returns (uint liquidity, address feeTo) {
        (uint112 _reserve0, uint112 _reserve1,) = IUniswapV2Pair(pair).getReserves();
        locals memory a;
        feeTo = IUniswapV2Factory(factory).feeTo();
        bool feeOn = feeTo != address(0);
        uint _kLast = IUniswapV2Pair(pair).kLast(); // gas savings
        if (feeOn) {
            if (_kLast != 0) {
                a.rootK = Math.sqrt(uint(_reserve0).mul(_reserve1));
                a.rootKLast = Math.sqrt(_kLast);
                if (a.rootK > a.rootKLast) {
                    a.numerator = IUniswapV2Pair(pair).totalSupply().mul(a.rootK.sub(a.rootKLast)).mul(mynum);
                    a.denominator = a.rootK.mul(myden).add(a.rootKLast.mul(mynum));
                    liquidity = a.numerator / a.denominator;
                }
            }
        }
        return (liquidity, feeTo);
    }
}

library UniswapV2Library {
    using SafeMath for uint;    

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, 'UniswapV2Library: IDENTICAL_ADDRESSES');
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'UniswapV2Library: ZERO_ADDRESS');
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(address factory, address tokenA, address tokenB, bytes memory init) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(uint(keccak256(abi.encodePacked(
                hex'ff',
                factory,
                keccak256(abi.encodePacked(token0, token1)),
                init // init code hash
            ))));
    }

    // fetches and sorts the reserves for a pair
    function getReserves(address factory, address tokenA, address tokenB, bytes memory init) internal view returns (uint reserveA, uint reserveB) {
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint reserve0, uint reserve1,) = IUniswapV2Pair(pairFor(factory, tokenA, tokenB, init)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    // given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
    function quote(uint amountA, uint reserveA, uint reserveB) internal pure returns (uint amountB) {
        require(amountA > 0, 'UniswapV2Library: INSUFFICIENT_AMOUNT');
        require(reserveA > 0 && reserveB > 0, 'UniswapV2Library: INSUFFICIENT_LIQUIDITY');
        amountB = amountA.mul(reserveB) / reserveA;
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, uint mynumerator) internal pure returns (uint amountOut) {
        require(amountIn > 0, 'UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'UniswapV2Library: INSUFFICIENT_LIQUIDITY');
        uint amountInWithFee = amountIn.mul(mynumerator); //Uniswap is 997, Pancakeswap is 998
        uint numerator = amountInWithFee.mul(reserveOut);
        uint denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut, uint mynumerator) internal pure returns (uint amountIn) {
        require(amountOut > 0, 'UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'UniswapV2Library: INSUFFICIENT_LIQUIDITY');
        uint numerator = reserveIn.mul(amountOut).mul(1000);
        uint denominator = reserveOut.sub(amountOut).mul(mynumerator);
        amountIn = (numerator / denominator).add(1);
    }

    // performs chained getAmountOut calculations on any number of pairs
    function getAmountsOut(address factory, uint amountIn, address[] memory path, bytes memory init, uint mynumerator) internal view returns (uint[] memory amounts) {
        require(path.length >= 2, 'UniswapV2Library: INVALID_PATH');
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        for (uint i; i < path.length - 1; i++) {
            (uint reserveIn, uint reserveOut) = getReserves(factory, path[i], path[i + 1], init);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut, mynumerator);
        }
    }

    // performs chained getAmountIn calculations on any number of pairs
    function getAmountsIn(address factory, uint amountOut, address[] memory path, bytes memory init, uint mynumerator) internal view returns (uint[] memory amounts) {
        require(path.length >= 2, 'UniswapV2Library: INVALID_PATH');
        amounts = new uint[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint i = path.length - 1; i > 0; i--) {
            (uint reserveIn, uint reserveOut) = getReserves(factory, path[i - 1], path[i], init);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut, mynumerator);
        }
    }
}

// helper methods for interacting with ERC20 tokens and sending ETH that do not consistently return true/false
library TransferHelper {
    function safeApprove(address token, address to, uint value) internal {
        // bytes4(keccak256(bytes('approve(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x095ea7b3, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'TransferHelper: APPROVE_FAILED');
    }

    function safeTransfer(address token, address to, uint value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'TransferHelper: TRANSFER_FAILED');
    }

    function safeTransferFrom(address token, address from, address to, uint value) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'TransferHelper: TRANSFER_FROM_FAILED');
    }

    function safeTransferETH(address to, uint value) internal {
        (bool success,) = to.call{value:value}(new bytes(0));
        require(success, 'TransferHelper: ETH_TRANSFER_FAILED');
    }
}