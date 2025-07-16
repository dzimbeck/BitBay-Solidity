// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface liquidityPool {
    function syncAMM(address pair) external;
}

contract sendToPair {
    function sendAndSync(address pool, address token, address pair, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(pair != address(0), "Invalid pair address");
        require(amount > 0, "Amount must be greater than zero");
        require(IERC20(token).transferFrom(msg.sender, pair, amount), "Token transfer failed");
        liquidityPool(pool).syncAMM(pair);
    }
}