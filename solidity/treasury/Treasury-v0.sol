// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity = 0.8.4;

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface vContract {
    function sendVote(address, uint256, bytes[] calldata) external returns(bool);
}

interface IVault {
    function getVaultAddress(address user) external view returns (address);
    function BAYL() external view returns (address);
    function BAYR() external view returns (address);
}

contract ProtocolTreasury {
    address public vault;                   // This mints/burns tokens by locking coins
    uint256 public totalTokens;             // Total accessTokens
    uint256 public totalShares;             // Total payable shares pending
    uint256 public lastBlock;               // Time since shares were last generated
    uint256 public claimRate = 7200;        // Number of blocks before rewards reduce. 4 hours on Polygon
    uint256 public refreshRate = 30 days;   // Frequency to update liquid token balances due to the peg
    uint256 public maxTopStakers = 10;
    uint256 public varlock;    
    address public minter;
    address[] public userList;
    bool public locked;
    bool public liquidPool; // The pool can represent liquid or reserve tokens
    mapping(address => uint256) public deductions;
    mapping(uint256 => mapping(address => uint256)) public weeklyRewards;
    mapping(address => bool) public isRegistered;

    struct TopStaker {
        address user;
        uint256 shares;
    }
    TopStaker[] public topStakers;

    struct AccessInfo {
        uint256 shares;
        uint256 stakeBlock;
        uint256 lastRefresh;
        address[] coins;
        mapping(address => uint256) pendingRewards;
    }
    mapping(address => AccessInfo) public accessPool;

    constructor(bool _liquidPool) {
        minter = msg.sender;
        liquidPool = _liquidPool;
    }

    function changeMinter(address newminter) external {
        require(msg.sender == minter);
        minter = newminter;
    }

    function setVault(address _vault) external {
        require(msg.sender == minter);
        require(vault == address(0));
        vault = _vault;
    }

    function setRefreshRate(uint256 _refreshRate) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(_refreshRate >= 1 days && _refreshRate <= 365 days);
        refreshRate = _refreshRate;
    }

    function setClaimRate(uint256 setBlocks) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(setBlocks >= 300);
        claimRate = setBlocks;
    }

    function setMaxTopStakers(uint256 totalStakers) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(totalStakers <= 25);
        maxTopStakers = totalStakers;
    }

    function lockVariables(uint locktime) external {
        require(msg.sender == minter);
        require(varlock < block.timestamp + 7 days);
        varlock = block.timestamp + locktime;
    }

    function setCoins(address[] memory coins) external {
        for (uint256 i = 0; i < coins.length; i++) {
             for (uint256 j = i + 1; j < coins.length; j++) {
                require(coins[i] != coins[j], "Duplicate coin");
            }
        }
        accessPool[msg.sender].coins = coins;
    }

    function getUserCoins(address user) external view returns (address[] memory) {
        return accessPool[user].coins;
    }

    function getPendingReward(address user, address coin) external view returns (uint256) {
        return accessPool[user].pendingRewards[coin];
    }

    function getTopStakers() external view returns (TopStaker[] memory) {
        return topStakers;
    }

    function getUsers(uint256 start, uint256 count) external view returns (address[] memory, uint256) {
        uint256 end = start + count;
        if (end > userList.length) end = userList.length;
        address[] memory result = new address[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = userList[i];
        }
        return (result, userList.length);
    }

    // ----------- Access Token Yield Share -----------

    function depositVault(address user, uint256 amount) external {
        require(!locked);
        require(msg.sender == vault);
        locked = true;
        require(amount > 0, "Zero deposit");
        if (accessPool[user].shares == 0) {
            if(!isRegistered[user]) {
                isRegistered[user] = true;
                userList.push(user);
            }
            accessPool[user].stakeBlock = block.number;
            accessPool[user].lastRefresh = block.timestamp;
        }
        _updateUser(user);
        accessPool[user].shares += amount;
        totalTokens += amount;
        _updateTopStakers(user, accessPool[user].shares);
        locked = false;
    }

    function withdrawVault(address user, uint256 amount) external {
        require(!locked);
        require(msg.sender == vault);
        locked = true;
        require(accessPool[user].shares >= amount, "Not enough shares");
        _updateUser(user);
        accessPool[user].shares -= amount;
        totalTokens -= amount;
        _updateTopStakers(user, accessPool[user].shares);
        locked = false;
    }

    function refreshVault() external {
        require(!locked);
        locked = true;
        address user = msg.sender;
        address userVault = IVault(vault).getVaultAddress(user);
        require(userVault != address(0));
        address BitBay;
        if(liquidPool) {
            BitBay = IVault(vault).BAYL();
        } else {
            BitBay = IVault(vault).BAYR();
        }
        bool paused;
        if(accessPool[user].lastRefresh == 1) {
            paused = true;
        }
        accessPool[user].lastRefresh = block.timestamp;
        _updateUser(user);
        uint balance = IERC20(BitBay).balanceOf(userVault);
        if (accessPool[user].shares == 0) {
            accessPool[user].stakeBlock = block.number;
        }        
        if(!paused) {
            totalTokens -= accessPool[user].shares; //Already deducted
        }
        accessPool[user].shares = balance;
        totalTokens += balance;
        _updateTopStakers(user, accessPool[user].shares);
        locked = false;
    }

    function claimRewards(address voteContract, bytes[] memory votes) external {
        require(!locked);
        locked = true;
        AccessInfo storage user = accessPool[msg.sender];
        uint256 accumulated = (block.number - user.stakeBlock) * (user.shares);
        if(accumulated > 0) {        
            if(voteContract != address(0)) {
                if ((block.number - user.stakeBlock) < claimRate) {
                    vContract(voteContract).sendVote(msg.sender, accumulated, votes);
                }
            }
            _updateUser(msg.sender);
        }
        uint32 x;
        uint256 reward;
        while(x < user.coins.length) {
            reward = user.pendingRewards[user.coins[x]];
            if(reward > 0) {
                require(IERC20(user.coins[x]).balanceOf(address(this)) >= reward, "Not enough funds"); 
                deductions[user.coins[x]] -= reward;
                user.pendingRewards[user.coins[x]] = 0;
                IERC20(user.coins[x]).transfer(msg.sender, reward);
            }
            x += 1;
        }
        locked = false;
    }

    // ----------- Reward Logic -----------

    function updateUser(address user) external {
        require(!locked);
        locked = true;
        if(user != msg.sender) {
            uint sections;
            if((block.number - accessPool[user].stakeBlock) > claimRate) {
                sections = ((block.number - accessPool[user].stakeBlock) / claimRate) * 10;
            }
            require(sections >= 100);
        }
        _updateUser(user);
        if(user != msg.sender) {
            _updateTopStakers(user, accessPool[user].shares);
        }
        locked = false;
    }

    function _updateUser(address _user) internal {
        updateShares();
        AccessInfo storage user = accessPool[_user];
        require(user.lastRefresh + refreshRate > block.timestamp);
        uint256 accumulated = (block.number - user.stakeBlock) * (user.shares);
        if (accumulated == 0) {
            return;
        }
        uint32 x;
        uint256 netYield;
        uint256 pending;
        uint256 sections;
        while(x < user.coins.length) {
            netYield = IERC20(user.coins[x]).balanceOf(address(this)) - deductions[user.coins[x]];
            pending = (netYield * accumulated) / totalShares;
            if((block.number - user.stakeBlock) > claimRate) {
                sections = ((block.number - user.stakeBlock) / claimRate) * 10;
                if(sections < 100) {
                    pending = (pending * (100 - sections)) / 100;
                } else {                    
                    user.lastRefresh = 1; //Inactive staking should not dilute the system
                    totalTokens -= user.shares;
                    user.shares = 0;
                    pending = 0;
                    break;
                }
            }
            weeklyRewards[(block.timestamp / 7 days)][user.coins[x]] += pending;
            user.pendingRewards[user.coins[x]] += pending;
            deductions[user.coins[x]] += pending;
            x += 1;
        }
        user.stakeBlock = block.number;
        totalShares -= accumulated;
    }

    function updateShares() public {
        totalShares += (block.number - lastBlock) * (totalTokens);
        lastBlock = block.number;
    }

    function pendingReward(address userAddr) external view returns (uint256[] memory) {
        AccessInfo storage user = accessPool[userAddr];
        uint256 accumulated = (block.number - user.stakeBlock) * (user.shares);
        uint256[] memory rewards = new uint256[](user.coins.length);
        if (user.shares == 0 || accumulated == 0) return rewards;
        uint256 tempTotalShares = totalShares + ((block.number - lastBlock) * (totalTokens));
        uint32 x;
        uint256 netYield;
        uint256 pending;
        uint256 sections;
        while(x < user.coins.length) {
            netYield = IERC20(user.coins[x]).balanceOf(address(this)) - deductions[user.coins[x]];
            pending = (netYield * accumulated) / tempTotalShares;
            if((block.number - user.stakeBlock) > claimRate) {
                sections = ((block.number - user.stakeBlock) / claimRate) * 10;
                if(sections < 100) {
                    pending = (pending * (100 - sections)) / 100;
                } else {
                    pending = 0;
                }
            }
            rewards[x] = user.pendingRewards[user.coins[x]] + pending;
            x+=1;
        }
        return rewards;
    }

    function _updateTopStakers(address user, uint256 shares) internal {
        if (shares == 0 || accessPool[user].lastRefresh == 1) {
            for (uint256 i = 0; i < topStakers.length; i++) {
                if (topStakers[i].user == user) {
                    // Mark the slot as open
                    topStakers[i].user = address(0);
                    topStakers[i].shares = 0;
                    return;
                }
            }
            return;
        }
        for (uint256 i = 0; i < topStakers.length; i++) {
            if (topStakers[i].user == user) {
                topStakers[i].shares = shares;
                return;
            }
        }
        if (topStakers.length < maxTopStakers) {
            topStakers.push(TopStaker({user: user, shares: shares}));
            return;
        }
        uint256 smallestIndex = 0;
        uint256 smallestShares = type(uint256).max;
        for (uint256 i = 0; i < topStakers.length; i++) {
            if (topStakers[i].shares < smallestShares) {
                smallestShares = topStakers[i].shares;
                smallestIndex = i;
            }
            if (topStakers[i].user == address(0)) {
                topStakers[i] = TopStaker({user: user, shares: shares});
                return;
            }
        }
        if (shares > smallestShares) {
            topStakers[smallestIndex] = TopStaker({user: user, shares: shares});
        }
    }
}