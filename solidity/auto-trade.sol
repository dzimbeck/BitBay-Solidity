// SPDX-License-Identifier: MIT
pragma solidity = 0.8.4;

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
interface IWETH {
    function deposit() external payable;
}
interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}
interface ISwapRouterV3 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}
interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32);
    function token0() external view returns (address);
    function token1() external view returns (address);
}
interface IRouterV2Custom {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline,
        address fact
    ) external returns (uint[] memory amounts);
}

contract POLTrade {
    address constant WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    address constant DAI    = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;

    ISwapRouterV3 public constant router = ISwapRouterV3(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    AggregatorV3Interface internal constant priceFeed = AggregatorV3Interface(0xAB594600376Ec9fD91F8e885dADF0CE036862dE0);

    uint24 constant FEE = 3000; // 0.3% most liquid
    bool lock = false;
    
    IERC20 constant daiToken = IERC20(DAI);
    IWETH constant wmaticToken = IWETH(WMATIC);

    receive() external payable {}

    function tradePOLtoDAI(address destination, uint256 assumedPrice, uint256 slippage, bool toBAY) public payable {
        require(!lock);
        lock = true;
        require(msg.value > 0, "No POL sent");
        uint256 destBalance = address(destination).balance;
        if(toBAY == true) {
            destination = address(this);
        }
        uint256 polToKeep = 0;
        if (destBalance < 5 ether) {
            polToKeep = 5 ether - destBalance;
        }
        uint256 amountToSwap = msg.value - polToKeep;
        require(amountToSwap > 0, "Nothing to swap");
        // Get current price from Chainlink
        (, int256 chainlinkPrice,,,) = priceFeed.latestRoundData();
        require(chainlinkPrice > 0, "Chainlink price feed invalid");
        // Check user assumption within 5% of Chainlink
        uint256 lowerBound = (uint256(chainlinkPrice) * 95) / 100;
        uint256 upperBound = (uint256(chainlinkPrice) * 105) / 100;
        require(assumedPrice >= lowerBound && assumedPrice <= upperBound, "Assumed price out of range");
        // Wrap POL to WMATIC
        wmaticToken.deposit{value: amountToSwap}();
        IERC20(WMATIC).approve(address(router), amountToSwap);
        // Calculate minimum DAI output based on assumed price and 2% slippage
        uint256 expectedDAI = (amountToSwap * assumedPrice) / 1e8;
        uint256 minOut = (expectedDAI * (100 - slippage)) / 100;
        router.exactInputSingle(
            ISwapRouterV3.ExactInputSingleParams({
                tokenIn: WMATIC,
                tokenOut: DAI,
                fee: FEE,
                recipient: destination,
                deadline: block.timestamp + 120,
                amountIn: amountToSwap,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        if (polToKeep > 0) {
            if(destination != address(this)) {
                (bool sent,) = destination.call{value: polToKeep}("");
                require(sent, "POL transfer failed");
            }
        }
        lock = false;
    }

    struct stackVars {
        uint daiAmount;
        uint amountIn;
        uint attempt;
        uint expectedOut;
        uint minOut;
        uint dexPrice;
        uint upperBound;
        uint lowerBound;
    }

    function tradePOLtoBAY(
        address destination,
        uint256 assumedPricePOL,
        uint256 assumedPriceBAY, //Chainlink style 8 decimal DAI price
        uint256 slippagePOL,
        uint256 slippageBAY,
        address routerV2,
        address factory,
        address bayToken
    ) external payable {
        // Step 1: Trade POL to DAI
        this.tradePOLtoDAI{value: msg.value}(destination, assumedPricePOL, slippagePOL, true);
        require(!lock);
        lock = true;
        stackVars memory a;
        // Step 2: Prepare to trade resulting DAI
        a.daiAmount = daiToken.balanceOf(address(this));
        require(a.daiAmount > 0, "No DAI received");
        daiToken.approve(routerV2, a.daiAmount);
        address[] memory path = new address[](2);
        path[0] = DAI;
        path[1] = bayToken;
        a.amountIn = a.daiAmount;
        // Step 3: Iterate backwards in 10% decrements if slippage is too high
        while (a.attempt < 20) {
            a.expectedOut = getAmountOut(factory, path, a.amountIn);
            a.minOut = (a.expectedOut * (100 - slippageBAY)) / 100;
            a.dexPrice = ((a.amountIn * 1e8) / a.expectedOut) / 1e10;
            a.lowerBound = (assumedPriceBAY * (100 - slippageBAY)) / 100;
            a.upperBound = (assumedPriceBAY * (100 + slippageBAY)) / 100;
            if (a.dexPrice >= a.lowerBound && a.dexPrice <= a.upperBound) {
                break;
            }
            a.amountIn = (a.amountIn * 90) / 100;
            a.attempt++;
        }
        require(a.attempt != 20, "Too much slippage");
        require(a.amountIn > 0, "Swap amount reduced to zero");
        // Step 4: Perform swap with amountIn
        IRouterV2Custom(routerV2).swapExactTokensForTokens(
            a.amountIn,
            a.minOut,
            path,
            destination,
            block.timestamp + 120,
            factory
        );
        // Step 5: Send leftover DAI back
        uint256 daiLeft = daiToken.balanceOf(address(this));
        if (daiLeft > 0) {
            daiToken.transfer(destination, daiLeft);
        }
        // Step 6: If any POL was reserved in tradePOLtoDAI, send it too
        uint256 polLeft = address(this).balance;
        if (polLeft > 0) {
            (bool sent,) = destination.call{value: polLeft}("");
            require(sent, "POL transfer failed");
        }
        lock = false;
    }

    // Utility: compute amountOut from reserves
    function getAmountOut(address factory, address[] memory path, uint amountIn) internal view returns (uint) {
        require(path.length == 2, "Only 2-step supported");
        address pair = IUniswapV2Factory(factory).getPair(path[0], path[1]);
        require(pair != address(0), "No pair found");
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pair).getReserves();
        (uint112 reserveIn, uint112 reserveOut) =
            path[0] == IUniswapV2Pair(pair).token0() ? (reserve0, reserve1) : (reserve1, reserve0);
        require(reserveIn > 0 && reserveOut > 0, "Bad reserves");
        uint amountInWithFee = amountIn * 997; // 0.3% fee assumption
        uint numerator = amountInWithFee * reserveOut;
        uint denominator = (reserveIn * 1000) + amountInWithFee;
        return numerator / denominator;
    }
}