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

interface ITreasury {
    function refreshVault(address user) external;
}

contract ProtocolTreasury {
    address public vault;                   // This mints/burns tokens by locking coins
    address public pairedPool;              // The other treasury so that they sync together
    uint256 public totalTokens;             // Total accessTokens
    uint256 public totalShares;             // Total payable shares pending
    uint256 public nextTotalShares;         // Amount of pending shares for next interval
    uint256 public lastInterval;            // Time since shares were last generated
    uint256 public claimRate = 7200;        // Number of blocks per voting interval. 4 hours on Polygon
    uint256 public refreshRate = 14 days;   // Frequency to update liquid token balances due to the peg
    uint256 public votePeriod = 25;         // Time window for voting
    uint256 public maxTopStakers = 10;
    uint256 public varlock;
    address public minter;
    address[] public userList;
    bool public locked;
    bool public liquidPool; // The pool can represent liquid or reserve tokens
    mapping(uint256 => mapping(address => uint256)) public weeklyRewards;
    mapping(uint256 => mapping(address => bool)) public balanceChecked;
    mapping(address => uint256) public coinBalance;
    mapping(address => bool) public isRegistered;

    struct TopStaker {
        address user;
        uint256 shares;
    }
    TopStaker[] public topStakers;

    struct AccessInfo {
        uint256 shares;
        uint256 staked;
        uint256 interval;
        uint256 lastRefresh;
        address[] coins;
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

    function setPairedPool(address _pairedPool) external {
        require(msg.sender == minter);
        require(pairedPool == address(0));
        pairedPool = _pairedPool;
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

    function setVotePeriod(uint256 _votePeriod) external {
        require(block.timestamp > varlock);
        require(msg.sender == minter);
        require(_votePeriod >= 10 && _votePeriod <= 90);
        votePeriod = _votePeriod;
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

    function claimPeriod() public view returns (bool) {
        return ((block.number % claimRate) >= (claimRate * (100 - votePeriod)) / 100);
    }

    function depositVault(address user, uint256 amount) external {
        accessPool[user].lastRefresh = 1;
        refreshVault(user);
        require(!locked);
        require(msg.sender == vault);
        locked = true;
        require(amount > 0, "Zero deposit");
        accessPool[user].shares += amount;
        totalTokens += amount;
        updateShares();
        _updateTopStakers(user, accessPool[user].shares);
        locked = false;
    }

    function withdrawVault(address user, uint256 amount) external {
        accessPool[user].lastRefresh = 1;
        refreshVault(user);
        require(!locked);
        require(msg.sender == vault);
        locked = true;
        require(accessPool[user].shares >= amount, "Not enough shares");
        require(accessPool[user].interval < (block.number / claimRate), "Can not withdraw while staking");
        accessPool[user].shares -= amount;
        totalTokens -= amount;
        _updateTopStakers(user, accessPool[user].shares);
        locked = false;
    }

    function refreshVault(address user) public {
        require(!locked);
        locked = true;
        if(accessPool[user].lastRefresh != 1 && msg.sender != pairedPool) {
            require(user == msg.sender);
        }
        if(msg.sender != pairedPool) {
            ITreasury(pairedPool).refreshVault(user);
        }
        if(!isRegistered[user]) {
            isRegistered[user] = true;
            userList.push(user);
        }
        address userVault = IVault(vault).getVaultAddress(user);
        require(userVault != address(0));
        address BitBay;
        if(liquidPool) {
            BitBay = IVault(vault).BAYL();
        } else {
            BitBay = IVault(vault).BAYR();
        }        
        uint balance = IERC20(BitBay).balanceOf(userVault);
        totalTokens -= accessPool[user].shares;
        accessPool[user].shares = balance;
        totalTokens += balance;
        if(accessPool[user].lastRefresh != 1) {
            _updateTopStakers(user, accessPool[user].shares);
        }
        accessPool[user].lastRefresh = block.timestamp;
        locked = false;
    }

    function claimRewards(address voteContract, bytes[] memory votes) external {
        require(!locked);
        locked = true;
        updateShares();
        AccessInfo storage user = accessPool[msg.sender];
        require(user.lastRefresh + refreshRate > block.timestamp);
        uint256 currentInterval = (block.number / claimRate);
        if(user.interval == currentInterval) {
            if(claimPeriod()) {
                if(voteContract != address(0)) {
                    vContract(voteContract).sendVote(msg.sender, user.staked, votes);
                }
                uint32 x;
                uint256 reward;
                while(x < user.coins.length) {
                    if(!balanceChecked[currentInterval][user.coins[x]]) {
                        balanceChecked[currentInterval][user.coins[x]] = true;
                        coinBalance[user.coins[x]] = IERC20(user.coins[x]).balanceOf(address(this));
                    }
                    reward = (coinBalance[user.coins[x]] * user.staked) / totalShares;
                    if(reward > 0) {
                        coinBalance[user.coins[x]] -= reward;
                        weeklyRewards[(block.timestamp / 7 days)][user.coins[x]] += reward;
                        _safeTransfer(user.coins[x], msg.sender, reward);
                    }
                    x += 1;
                }
                user.interval += 1;
                totalShares -= user.staked;
                nextTotalShares += user.shares;
                user.staked = user.shares;
            }
        }
        locked = false;
    }

    function updateShares() public {
        AccessInfo storage user = accessPool[msg.sender];
        uint256 currentInterval = (block.number / claimRate);
        if(lastInterval < currentInterval) {
            totalShares = nextTotalShares;
            nextTotalShares = 0;
        }
        if(!claimPeriod()) {
            if((user.interval) < currentInterval) {
                totalShares += user.shares;
                user.staked = user.shares;
                user.interval = currentInterval;
            }
        }
        lastInterval = currentInterval;
    }

    function pendingReward(address userAddr) external view returns (uint256[] memory) {
        AccessInfo storage user = accessPool[userAddr];
        uint256[] memory rewards = new uint256[](user.coins.length);
        uint256 currentInterval = block.number / claimRate;
        if (user.staked == 0 || (user.interval != currentInterval)) return rewards;
        uint256 tempShares = totalShares;
        if(lastInterval < currentInterval) {
            tempShares = nextTotalShares;
        }
        uint32 x;
        while(x < user.coins.length) {
            uint256 bal = balanceChecked[currentInterval][user.coins[x]] ? coinBalance[user.coins[x]] : IERC20(user.coins[x]).balanceOf(address(this));
            rewards[x] = (bal * user.staked) / tempShares;
            x+=1;
        }
        return rewards;
    }

    function _updateTopStakers(address user, uint256 shares) internal {
        for (uint256 i = 0; i < topStakers.length; i++) {
            if (topStakers[i].user == user) {
                if (shares == 0) {
                    topStakers[i].user = address(0);
                }
                topStakers[i].shares = shares;
                return;
            }
        }
        if (shares == 0) {
            return;
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

    function _safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }
}