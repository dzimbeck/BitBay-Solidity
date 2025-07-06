// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity = 0.8.4;

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface vContract {
    function sendVote(address, uint256, uint32, string memory) external returns (bool);
}

contract ProtocolTreasury {
    IERC20 public stETH;
    IERC20 public accessToken;
    uint256 public totalPrincipal;   // Total stETH locked
    uint256 public deductions;       // Amount owed on prior stakes
    uint256 public totalTokens;      // Total accessTokens
    uint256 public totalShares;      // Total payable shares pending
    uint256 public lastBlock;        // Time since shares were last generated
    uint256 public lastNetYield;     // Last known yield
    uint256 public claimRate = 7200; // Number of blocks before rewards reduce
    uint256 public maxyears;
    uint256 public varlock;
    address public voteContract;
    address public minter;
    bool public locked;

    struct Savings {
        uint256 amount;
        uint256 unlockTimestamp;
    }

    //Users generate tokens the longer they stay in the pool
    struct AccessInfo {
        uint256 shares;
        uint256 stakeBlock;
        uint256 pendingRewards;
    }

    mapping(address => Savings) public deposits;
    mapping(address => AccessInfo) public accessPool;

    constructor(address _stETH, address _accessToken) {
        stETH = IERC20(_stETH);
        accessToken = IERC20(_accessToken);
        minter = msg.sender;
        maxyears = 5;
    }

    function changeMinter(address newminter) external {
        require(msg.sender == minter);
        minter = newminter;
    }

    function setVoteContract(address newcontract) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        voteContract = newcontract;
    }

    function setMaxYears(uint256 setYears) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(setYears > 0 && setYears <= 10);
        maxyears = setYears;
    }

    function setClaimRate(uint256 setBlocks) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(setBlocks >= 300);
        claimRate = setBlocks;
    }

    function lockVariables(uint locktime) public returns (bool) {
        require(msg.sender == minter);
        require(varlock < block.timestamp - 604800);
        varlock = block.timestamp + locktime;
        return true;
    }

    // ----------- STETH Long Term Savings(HODLing), Protocol owned treasury -----------

    function lockStETH(uint256 amount, uint256 yearsLock, bool increment) external {
        require(!locked);
        locked = true;
        require(amount > 0, "Zero amount");
        require(yearsLock > 0 && yearsLock <= maxyears, "Invalid lock period");

        stETH.transferFrom(msg.sender, address(this), amount);

        Savings storage user = deposits[msg.sender];
        user.amount += amount;
        if(!increment || user.unlockTimestamp == 0) {
            user.unlockTimestamp = block.timestamp + (yearsLock * 365 days);
        }
        totalPrincipal += amount;
        locked = false;
    }

    function withdrawStETH() external {
        require(!locked);
        locked = true;
        Savings storage user = deposits[msg.sender];
        require(block.timestamp >= user.unlockTimestamp, "Locked");
        require(user.amount > 0, "Nothing to withdraw");
        uint256 amt = user.amount;
        uint256 contractBalance = stETH.balanceOf(address(this));
        // In the unlikely occurance where Lido stakers are slashed socialize the difference among all users
        // If its a small amount users may also choose to wait for rewards to restore the total principal.
        if (contractBalance < totalPrincipal) {
            uint256 reduction = ((user.amount * (totalPrincipal - contractBalance)) / totalPrincipal);
            amt = user.amount - reduction;
        }
        user.unlockTimestamp = 0;
        user.amount = 0;
        totalPrincipal -= amt;

        stETH.transfer(msg.sender, amt);
        locked = false;
    }

    // ----------- Access Token Yield Share -----------

    function depositAccessToken(uint256 amount) external {
        require(!locked);
        locked = true;
        require(amount > 0, "Zero deposit");
        if (accessPool[msg.sender].shares == 0) {
            accessPool[msg.sender].stakeBlock = block.number;
        }
        updateRewards();
        _updateUser(msg.sender);

        accessToken.transferFrom(msg.sender, address(this), amount);
        accessPool[msg.sender].shares += amount;
        totalTokens += amount;
        locked = false;
    }

    function withdrawAccessToken(uint256 amount) external {
        require(!locked);
        locked = true;
        AccessInfo storage user = accessPool[msg.sender];
        require(user.shares >= amount, "Not enough shares");

        updateRewards();
        _updateUser(msg.sender);

        user.shares -= amount;
        totalTokens -= amount;

        accessToken.transfer(msg.sender, amount);
        locked = false;
    }

    function claimRewards(uint32 vote, string memory othervotes) external {
        require(!locked);
        locked = true;
        updateRewards();
        _updateUser(msg.sender);

        uint256 reward = accessPool[msg.sender].pendingRewards;
        require(reward > 0, "No rewards");
        uint256 currentBalance = stETH.balanceOf(address(this));
        require(currentBalance - reward >= totalPrincipal, "Can not deduct from principal"); //Eliminate any risk
        if(voteContract != address(0)) {
            vContract(voteContract).sendVote(msg.sender, reward, vote, othervotes);
        }
        deductions -= reward;
        accessPool[msg.sender].pendingRewards = 0;
        stETH.transfer(msg.sender, reward);
        locked = false;
    }

    // ----------- Internal Reward Logic -----------

    function _updateUser(address userAddr) internal {
        AccessInfo storage user = accessPool[userAddr];
        if (user.shares == 0) return;
        uint256 accumulated = (block.number - user.stakeBlock) * (user.shares);
        if (accumulated == 0) return;
        uint256 pending = (lastNetYield * accumulated) / totalShares;
        if((block.number - user.stakeBlock) > claimRate) {
            uint256 sections = ((block.number - user.stakeBlock) / claimRate) * 10;
            if(sections < 100) {
                pending = (pending * (100 - sections)) / 100;
            } else {
                pending = 0;
            }
        }
        user.pendingRewards += pending;
        user.stakeBlock = block.number;
        deductions += pending;
        totalShares -= accumulated;
    }

    function updateRewards() public {
        uint256 currentBalance = stETH.balanceOf(address(this));
        uint256 netYield = currentBalance - totalPrincipal - deductions;
        totalShares += (block.number - lastBlock) * (totalTokens);
        lastBlock = block.number;
        lastNetYield = netYield;
    }

    function pendingReward(address userAddr) external view returns (uint256) {
        AccessInfo storage user = accessPool[userAddr];
        if (user.shares == 0) return user.pendingRewards;

        uint256 currentBalance = stETH.balanceOf(address(this));
        uint256 netYield = currentBalance - totalPrincipal - deductions;
        uint256 tempTotalShares = totalShares +  ((block.number - lastBlock) * (totalTokens));

        uint256 accumulated = (block.number - user.stakeBlock) * (user.shares);
        uint256 pending = (netYield * accumulated) / tempTotalShares;
        if((block.number - user.stakeBlock) > claimRate) {
            uint256 sections = ((block.number - user.stakeBlock) / claimRate) * 10;
            if(sections < 100) {
                pending = (pending * (100 - sections)) / 100;
            } else {
                pending = 0;
            }
        }
        return user.pendingRewards + pending;
    }
}