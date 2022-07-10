// SPDX-License-Identifier: GPL-3.0
pragma solidity = 0.8.4;

//WARNING: Do not assume this coin will operate the same with most standard contracts!
//This has an IERC20 interface but this is a completely revolutionary kind of coin with a variable supply.
//BitBay bridge codes things this way to be compatible with some popular AMM platforms and decentralized exchanges.
interface IHALO {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function increaseAllowance(address, uint value) external returns (bool);
    function decreaseAllowance(address spender, uint value) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract BAYL is IHALO {
    // --- ERC20 Data ---
    string public constant name     = "BitBay";
    string public constant symbol   = "BAY";
    string public version  = "1";
    uint public decimals = 8;
    uint public override totalSupply = 1e17;
    
    // Events allow clients to react to specific
    // contract changes you declare
    event Approval(address indexed from, address indexed to, uint amount);
    event Transfer(address indexed from, address indexed to, uint amount);
    
    address public minter;
    address public proxy; //Where all the peg functions and storage are

    uint public proxylock;
    
    constructor() {
        minter = msg.sender;
    }

    function changeMinter(address newminter) public {
        require(msg.sender == minter);
        minter = newminter;
    }    

    function setProxy(address prox) public {
        require(block.timestamp > proxylock);
        require(msg.sender == minter);
        proxy = prox;
    }

    function lockProxies(uint locktime) public returns (bool){
        require(msg.sender == minter);
        proxylock += block.timestamp + locktime;
        return true;
    }
    
    //ERC20 Functions
    //Note: Solidity does not allow spaces between parameters in abi function calls
    function balanceOf(address user) public virtual override view returns (uint) {
        bool success;
        bytes memory result;
        (success, result) = proxy.staticcall(abi.encodeWithSignature("balanceOf(address)",user));
        require(success);
        uint liquid = abi.decode(result, (uint));
        return liquid;
    }
    
    function allowance(address owner, address spender) public virtual override view returns (uint) {
        bool success;
        bytes memory result;
        (success, result) = proxy.staticcall(abi.encodeWithSignature("allowance(address,address)",owner,spender));
        require(success);
        return abi.decode(result, (uint));
    }
    
    function approve(address spender, uint value) public virtual override returns (bool) {
        require(spender != address(0));
        bool success;
        bytes memory result;
        (success, result) = proxy.call(abi.encodeWithSignature("approve(address,uint256,address,uint256)",spender,value,msg.sender,0));
        require(success);
        emit Approval(msg.sender, spender, value);
        return true;
    }
    
    function increaseAllowance(address spender, uint value) public virtual override returns (bool) {
        require(spender != address(0));
        bool success;
        bytes memory result;
        (success, result) = proxy.call(abi.encodeWithSignature("increaseAllowance(address,uint256,address,uint256)",spender,value,msg.sender,0));
        require(success); 
        emit Approval(msg.sender, spender, allowance(msg.sender, spender));
        return true;
    }
    
    function decreaseAllowance(address spender, uint value) public virtual override returns (bool) {
        require(spender != address(0));
        bool success;
        bytes memory result;
        (success, result) = proxy.call(abi.encodeWithSignature("decreaseAllowance(address,uint256,address,uint256)",spender,value,msg.sender,0));
        require(success); 
        emit Approval(msg.sender, spender, allowance(msg.sender, spender));
        return true;
    }
    
    function transfer(address to, uint value) public virtual override returns (bool) {
        bool success;
        bytes memory result;
        (success, result) = proxy.call(abi.encodeWithSignature("sendLiquid(address,address,uint256,address)",msg.sender,to,value,msg.sender));
        require(success);
        emit Transfer(msg.sender, to, value);
        return true;
    }
    
    function transferFrom(address from, address to, uint value) public virtual override returns (bool) {
        bool success;
        bytes memory result;
        (success, result) = proxy.call(abi.encodeWithSignature("sendLiquid(address,address,uint256,address)",from,to,value,msg.sender));
        require(success);
        emit Transfer(from, to, value);
        return true;
    }
}