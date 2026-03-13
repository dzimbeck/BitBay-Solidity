// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity = 0.8.4;

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface ITreasury {
    function depositVault(address to, uint256 amount) external;
    function withdrawVault(address from, uint256 amount) external;
}

interface IDataContract {
    function sendLiquid(address sender, address receiver, uint256 amount, address proxyAddr) external returns (bool);
    function sendReserve(address sender, address receiver, uint256 amount, uint256[] memory specialtx, uint sendspecial, address proxyaddy) external returns (bool);
}

contract UserVault {
    address public immutable owner;
    address public immutable main;
    address public immutable BAYL;
    address public immutable BAYR;

    constructor(address _owner, address _main, address _bayl, address _bayr) {
        owner = _owner;
        main = _main;
        BAYL = _bayl;
        BAYR = _bayr;
    }

    // MAIN CONTRACT instructs vault to pay user
    function withdrawLiquid(address user, uint256 value) external {
        require(msg.sender == main, "Only the parent contract can withdraw");
        require(user == owner, "Owner must be the recipient");
        IERC20(BAYL).transfer(user, value);
    }

    function withdrawReserve(address user, uint256 value) external {
        require(msg.sender == main, "Only the parent contract can withdraw");
        require(user == owner, "Owner must be the recipient");
        IERC20(BAYR).transfer(user, value);
    }
}

contract MainController {
    address public immutable BAYL;
    address public immutable BAYR;
    address public immutable BitBayData;
    address public immutable TreasuryLiquid;
    address public immutable TreasuryReserve;

    mapping(address => address) public vaultOf;

    event NewVault(address user, address vault);
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    constructor(address _bayl, address _bayr, address _data, address _treasuryLiquid, address _treasuryReserve) {
        BAYL = _bayl;
        BAYR = _bayr;
        BitBayData = _data;
        TreasuryLiquid = _treasuryLiquid;
        TreasuryReserve = _treasuryReserve;
    }

    // deterministic create2 salt
    function _salt(address user) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(user));
    }

    function _deployVault(address user) internal returns (address vault) {
        bytes32 salt = _salt(user);
        vault = address(new UserVault{salt: salt}(
            user,
            address(this),
            address(BAYL),
            address(BAYR)
        ));

        emit NewVault(user, vault);
    }

    function getVaultAddress(address user) public view returns (address predicted) {
        bytes32 salt = _salt(user);
        bytes32 codeHash = keccak256(
            abi.encodePacked(
                type(UserVault).creationCode,
                abi.encode(
                    user,
                    address(this),
                    address(BAYL),
                    address(BAYR)
                )
            )
        );
        predicted = address(uint160(uint(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            codeHash
        )))));
    }

    function depositLiquid(uint256 amount) external returns (bool) {
        require(amount > 0, "no amount");
        address user = msg.sender;
        address vault = vaultOf[user];
        if (vault == address(0)) {
            vault = _deployVault(user);
            vaultOf[user] = vault;
        }
        ITreasury(TreasuryLiquid).depositVault(user, amount);
        IDataContract(BitBayData).sendLiquid(user, vault, amount, user);
        emit Deposit(user, amount);
        return true;
    }

    function depositReserve(uint256 amount) external returns (bool) {
        require(amount > 0, "no amount");
        address user = msg.sender;
        address vault = vaultOf[user];
        if (vault == address(0)) {
            vault = _deployVault(user);
            vaultOf[user] = vault;
        }
        uint[] memory a;
        ITreasury(TreasuryReserve).depositVault(user, amount);
        IDataContract(BitBayData).sendReserve(user, vault, amount, a, 0, user);
        emit Deposit(user, amount);
        return true;
    }

    function withdrawLiquid(uint256 amount) external returns (bool) {
        require(amount > 0);
        address user = msg.sender;
        address vault = vaultOf[user];
        require(vault != address(0));
        ITreasury(TreasuryLiquid).withdrawVault(user, amount);
        UserVault(vault).withdrawLiquid(user, amount);
        emit Withdraw(user, amount);
        return true;
    }

    function withdrawReserve(uint256 amount) external returns (bool) {
        require(amount > 0);
        address user = msg.sender;
        address vault = vaultOf[user];
        require(vault != address(0));
        ITreasury(TreasuryReserve).withdrawVault(user, amount);
        UserVault(vault).withdrawReserve(user, amount);
        emit Withdraw(user, amount);
        return true;
    }
}