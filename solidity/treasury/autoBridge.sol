// SPDX-License-Identifier:  Coinleft Public License for BitBay
pragma solidity = 0.8.4;

interface IRootChainManager {
    function depositEtherFor(address user) external payable;
}

contract autoBridge {
    IRootChainManager public immutable rootChainManager; //Polygon PoS RootChainManager (immutable)
    address public recipient; //Polygon recipient that receives WETH on child chain
    address public immutable minter;
    bool public lockVars;
    uint256 public minAmount;

    event RecipientChanged(address indexed oldRecipient, address indexed newRecipient);
    event Bridged(address indexed from, uint256 amount);

    constructor(
        address _minter,
        address _recipient
    ) {
        require(_recipient != address(0), "invalid recipient");
        rootChainManager = IRootChainManager(0xA0c68C638235ee32657e8f720a23ceC1bFc77C77);
        minAmount = 10000000000;
        recipient = _recipient;
        minter = _minter;
    }

    receive() external payable {
        require(msg.value >= minAmount, "below minimum");
        require(recipient != address(0), "recipient not set");
        rootChainManager.depositEtherFor{value: msg.value}(recipient);
        emit Bridged(msg.sender, msg.value);
    }

    function setRecipient(address newRecipient) external {
        require(msg.sender == minter, "not minter");
        require(!lockVars, "variables locked");
        require(newRecipient != address(0), "invalid recipient");
        emit RecipientChanged(recipient, newRecipient);
        recipient = newRecipient;
    }

    function lockVariables() external {
        require(msg.sender == minter, "not minter");
        require(!lockVars, "already locked");
        lockVars = true;
    }

    function setMinAmount(uint256 newMin) external {
        require(msg.sender == minter, "not minter");
        require(!lockVars, "variables locked");
        require(newMin > 0, "invalid min");
        minAmount = newMin;
    }
}