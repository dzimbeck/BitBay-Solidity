// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity = 0.8.4;

interface IRootChainManager {
    function depositEtherFor(address user) external payable;
    function depositFor(address user, address rootToken, bytes calldata depositData) external;
}
interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract AutoBridge {
    IRootChainManager public immutable rootChainManager; //Polygon PoS RootChainManager (immutable)
    address public recipient; //Polygon recipient that receives WETH on child chain
    address public immutable minter;
    uint256 public varlock;
    uint256 public minAmount;

    event RecipientChanged(address indexed oldRecipient, address indexed newRecipient);
    event BridgedETH(address indexed from, address indexed to, uint256 amount);
    event BridgedERC20(address indexed from, address indexed token, address indexed to, uint256 amount);

    constructor(address _minter, address _recipient) {
        require(_recipient != address(0), "invalid recipient");
        rootChainManager = IRootChainManager(0xA0c68C638235ee32657e8f720a23ceC1bFc77C77);
        minAmount = 10000000000;
        recipient = _recipient;
        minter = _minter;
    }

    receive() external payable {
        _bridgeETH(recipient, msg.value);
    }

    function bridgeETH(address to) external payable {
        _bridgeETH(to, msg.value);
    }

    function _bridgeETH(address to, uint256 amount) internal {
        require(amount >= minAmount, "below minimum");
        require(to != address(0), "invalid recipient");
        rootChainManager.depositEtherFor{value: amount}(to);
        emit BridgedETH(msg.sender, to, amount);
    }

    function bridgeERC20(address token, address to, uint256 amount) external {
        require(amount > 0, "invalid amount");
        require(to != address(0), "invalid recipient");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transfer failed");
        IERC20(token).approve(address(rootChainManager), 0);
        require(IERC20(token).approve(address(rootChainManager), amount), "approve failed");
        rootChainManager.depositFor(to, token, abi.encode(amount));
        emit BridgedERC20(msg.sender, token, to, amount);
    }

    function setRecipient(address newRecipient) external {
        require(msg.sender == minter, "not minter");
        require(block.timestamp > varlock);
        require(newRecipient != address(0), "invalid recipient");
        emit RecipientChanged(recipient, newRecipient);
        recipient = newRecipient;
    }

    function setMinAmount(uint256 newMin) external {
        require(msg.sender == minter, "not minter");
        require(block.timestamp > varlock);
        require(newMin > 0, "invalid min");
        minAmount = newMin;
    }

    function lockVariables(uint256 locktime) external {
        require(msg.sender == minter, "not minter");
        require(varlock < block.timestamp + 7 days);
        varlock = block.timestamp + locktime;
    }
}