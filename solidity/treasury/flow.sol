// SPDX-License-Identifier:  Coinleft Public License for BitBay
pragma solidity = 0.8.4;

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract WETHDrip {
    IERC20 public weth;
    address public treasury;
    address public minter;
    uint256 public dripInterval = 5400;
    uint256 public totalIntervals = 30;
    uint256 public startBlock;
    uint256 public lastDripInterval;
    uint256 public varlock;
    bool public locked;
    
    constructor(address _weth, address _treasury) {
        weth = IERC20(_weth);
        treasury = _treasury;
        minter = msg.sender;
    }
    
    function changeMinter(address newminter) external {
        require(msg.sender == minter);
        minter = newminter;
    }
    
    function setTreasury(address _treasury) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        _sendRemaining();
        treasury = _treasury;
    }
    
    function setDripInterval(uint256 _interval) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(_interval >= 300 && _interval < 50000);
        _sendRemaining();
        dripInterval = _interval;
    }
    
    function setTotalIntervals(uint256 _intervals) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(_intervals >= 10 && _intervals <= 100);
        _sendRemaining();
        totalIntervals = _intervals;
    }
    
    function lockVariables(uint256 locktime) external {
        require(msg.sender == minter);
        require(varlock < block.timestamp + 7 days);
        varlock = block.timestamp + locktime;
    }
    
    function drip() external {
        require(!locked);
        locked = true;
        uint256 balance = weth.balanceOf(address(this));
        if (balance == 0) {
            locked = false;
            return;
        }
        // Fresh start if previous cycle completed
        if (startBlock == 0) {
            startBlock = block.number;
            lastDripInterval = 0;
        }
        uint256 currentInterval = (block.number - startBlock) / dripInterval;
        if (currentInterval > totalIntervals) {
            currentInterval = totalIntervals;
        }
        uint256 intervalsRemaining = totalIntervals - lastDripInterval;
        uint256 intervalsPassed = currentInterval - lastDripInterval;
        uint256 toSend;
        if (currentInterval >= totalIntervals) {
            toSend = balance;
            startBlock = 0;
        } else if (intervalsPassed > 0) {
            toSend = (balance * intervalsPassed) / intervalsRemaining;
        }
        if (toSend > 0) {
            lastDripInterval = currentInterval;
            weth.transfer(treasury, toSend);
        }
        locked = false;
    }
    
    function pendingDrip() external view returns (uint256) {
        uint256 balance = weth.balanceOf(address(this));
        if (balance == 0 || startBlock == 0) return 0;
        uint256 currentInterval = (block.number - startBlock) / dripInterval;
        if (currentInterval > totalIntervals) currentInterval = totalIntervals;
        if (currentInterval >= totalIntervals) return balance;
        uint256 intervalsRemaining = totalIntervals - lastDripInterval;
        uint256 intervalsPassed = currentInterval - lastDripInterval;
        return (balance * intervalsPassed) / intervalsRemaining;
    }

    function _sendRemaining() internal {
        uint256 balance = weth.balanceOf(address(this));
        if (balance > 0) {
            weth.transfer(treasury, balance);
        }
        startBlock = 0;
        lastDripInterval = 0;
    }
}