// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity = 0.8.4;

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

interface ICurvePool {
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external payable returns (uint256);
}

contract LidoStaking {
    IERC20 public stETH;
    uint256 public totalPrincipal;   // Total stETH locked
    uint256 public mindays;
    uint256 public maxdays;
    uint256 public varlock;
    uint256 public totalYield;
    uint256 public EPOCH_LENGTH = 90 days;
    address public treasuryProxy;    // Proxy contract that receives yield
    address public minter;
    bool public locked;

    struct Savings {
        uint256 amount;
        uint256 unlockTimestamp;
    }

    mapping(address => Savings) public deposits;
    mapping(uint256 => uint256) public unlockAmountByEpoch;

    event YieldSwappedToETH(uint256 stETHin, uint256 ethOut);
    event SentETHToTreasury(address treasury, uint256 amount);

    constructor(address _stETH, address _treasuryProxy) {
        stETH = IERC20(_stETH);
        treasuryProxy = _treasuryProxy;
        minter = msg.sender;
        mindays = 1;
        maxdays = 180;
    }

    function changeMinter(address newminter) external {
        require(msg.sender == minter);
        minter = newminter;
    }

    function setMinDays(uint256 setDays) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(setDays > 0 && setDays < maxdays);
        mindays = setDays;
    }

    function setMaxDays(uint256 setDays) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(setDays > mindays && setDays <= 3600);
        maxdays = setDays;
    }

    function setTreasuryProxy(address newProxy) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        treasuryProxy = newProxy;
    }

    function lockVariables(uint locktime) public returns (bool) {
        require(msg.sender == minter);
        require(varlock < block.timestamp + 7 days);
        varlock = block.timestamp + locktime;
        return true;
    }

    // ----------- STETH Lido Deposits -----------
    //The advantage of this pool is so that users may HODL while supporting the treasury and protocol. They may also stake for
    //the profits or provide LP depending on how the treasury uses the net profits from the HODL pool. If the user wants to
    //donate a percent of their net, then they should split funds between two contracts. 

    function lockStETH(uint256 amount, uint256 daysLock, bool increment) external {
        require(!locked);
        locked = true;
        require(amount > 0, "Zero amount");
        uint256 contractBalance = stETH.balanceOf(address(this));
        require(contractBalance >= totalPrincipal, "Pool is unbalanced, deposits temporarily disabled."); //Unlikely however let it correct first.
        require(daysLock >= mindays && daysLock <= maxdays, "Invalid lock period");
        uint256 balanceBefore = stETH.balanceOf(address(this));
        stETH.transferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = stETH.balanceOf(address(this)); //Staked ETH may round a small amount so verify the exact amount sent
        amount = balanceAfter - balanceBefore;
        Savings storage user = deposits[msg.sender];
        if (user.amount > 0) {
            if(unlockAmountByEpoch[timestampToEpoch(user.unlockTimestamp)] >= user.amount) {
                unlockAmountByEpoch[timestampToEpoch(user.unlockTimestamp)] -= user.amount;
            }
        }
        user.amount += amount;
        if(increment || block.timestamp >= user.unlockTimestamp) {
            uint256 newUnlockTime = block.timestamp + (daysLock * (1 days));
            require(newUnlockTime >= user.unlockTimestamp, "Cannot shorten lock duration");
            user.unlockTimestamp = newUnlockTime;
        }
        unlockAmountByEpoch[timestampToEpoch(user.unlockTimestamp)] += user.amount;
        totalPrincipal += amount;
        locked = false;
    }

    function tradeAndLockStETH(uint256 slippage, uint256 daysLock, bool increment) external payable returns (uint256 stETHReceived) {
        require(!locked, "locked");
        locked = true;
        require(msg.value > 0, "Zero ETH sent");
        require(daysLock >= mindays && daysLock <= maxdays, "Invalid lock period");
        address curvePool = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022; // stETH/ETH Curve pool
        uint256 stETHBefore = stETH.balanceOf(address(this));
        require(stETHBefore >= totalPrincipal, "Pool is unbalanced, deposits temporarily disabled.");
        require(slippage <= 1000, "Slippage exceeds 10%");
        uint256 minAllowed = (msg.value * (10000 - slippage)) / 10000;
        // Swap ETH → stETH (ETH index = 0, stETH index = 1)
        ICurvePool(curvePool).exchange{ value: msg.value }(0, 1, msg.value, minAllowed);
        uint256 stETHAfter = stETH.balanceOf(address(this));
        stETHReceived = stETHAfter - stETHBefore;
        require(stETHReceived >= minAllowed, "Slippage too high");
        // Same logic as lockStETH()
        Savings storage user = deposits[msg.sender];
        if (user.amount > 0) {
            if (unlockAmountByEpoch[timestampToEpoch(user.unlockTimestamp)] >= user.amount) {
                unlockAmountByEpoch[timestampToEpoch(user.unlockTimestamp)] -= user.amount;
            }
        }
        user.amount += stETHReceived;
        if (increment || block.timestamp >= user.unlockTimestamp) {
            uint256 newUnlockTime = block.timestamp + (daysLock * (1 days));
            require(newUnlockTime >= user.unlockTimestamp, "Cannot shorten lock duration");
            user.unlockTimestamp = newUnlockTime;
        }
        unlockAmountByEpoch[timestampToEpoch(user.unlockTimestamp)] += user.amount;
        totalPrincipal += stETHReceived;
        locked = false;
        return stETHReceived;
    }


    function withdrawStETH(uint256 amt) external {
        require(!locked);
        locked = true;
        Savings storage user = deposits[msg.sender];
        require(block.timestamp >= user.unlockTimestamp, "Locked");
        require(user.amount > 0, "Nothing to withdraw");
        require(amt <= user.amount, "Not enough funds");
        uint256 origAmt = amt;
        uint256 contractBalance = stETH.balanceOf(address(this));
        
        // In the unlikely occurance where Lido stakers are slashed socialize the difference among all users
        if (contractBalance < totalPrincipal) {
            amt = ((amt * (contractBalance)) / totalPrincipal);
        }
        if(unlockAmountByEpoch[timestampToEpoch(user.unlockTimestamp)] >= origAmt) {
            unlockAmountByEpoch[timestampToEpoch(user.unlockTimestamp)] -= origAmt;
        }
        totalPrincipal -= origAmt;
        user.amount -= origAmt;
        if(user.amount == 0) {
            user.unlockTimestamp = 0;
        }
        stETH.transfer(msg.sender, amt);
        locked = false;
    }

    function timestampToEpoch(uint256 t) public view returns (uint256) {
        return t / EPOCH_LENGTH;
    }

    // ----------- Yield Harvesting to Treasury -----------

    function availableYield() external view returns (uint256) {
        uint256 contractBalance = stETH.balanceOf(address(this));
        if (contractBalance > totalPrincipal) {            
            return contractBalance - totalPrincipal;
        }
        return 0;
    }

    function harvestAndSwapToETH(uint256 slippage, uint256 amount) external returns (uint256 ethSent) {
        require(!locked, "locked");
        locked = true;
        address curvePool = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022; // stETH/ETH Curve pool
        // Determine yield
        uint256 contractBalance = stETH.balanceOf(address(this));
        require(contractBalance > totalPrincipal, "No yield available");
        uint256 yield = contractBalance - totalPrincipal;
        require(amount <= yield);
        if(amount != 0) {
            yield = amount; //In case slippage is too high sell in increments
        }
        uint256 ethBefore = address(this).balance;
        require(stETH.approve(curvePool, yield), "approve failed");
        // Do the swap (stETH -> ETH) stETH = index 1, ETH = index 0 in this pool
        require(slippage <= 1000, "Slippage exceeds 10% limit");
        uint256 minAllowed = (yield * (10000 - slippage)) / 10000;
        ICurvePool(curvePool).exchange(1, 0, yield, minAllowed);
        uint256 ethAfter = address(this).balance;
        uint256 ethReceived = ethAfter - ethBefore;
        require(ethReceived >= minAllowed, "Slippage exceeds the limit");
        totalYield += yield;
        emit YieldSwappedToETH(yield, ethReceived);
        // Send ETH to treasury
        (bool ok, ) = payable(treasuryProxy).call{value: ethReceived}("");
        require(ok, "Failed to send ETH to treasuryProxy");
        emit SentETHToTreasury(treasuryProxy, ethReceived);
        stETH.approve(curvePool, 0);
        locked = false;
        return ethReceived;
    }
    
    receive() external payable {} // Allow contract to receive ETH from Curve pool
}