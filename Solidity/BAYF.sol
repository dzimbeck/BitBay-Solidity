// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity = 0.8.4;

//WARNING: Do not assume this coin will operate the same with most standard contracts!
//This has an IERC20 interface but this is a completely revolutionary kind of coin with a variable supply.
//BitBay bridge codes things this way to be compatible with some popular AMM platforms and decentralized exchanges.
interface IHALO {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract BAYF is IHALO {
    // --- ERC20 Data ---
    string public constant name     = "BitBay Frozen";
    string public constant symbol   = "BAYF";
    string public version  = "1";
    uint public decimals = 8;
    uint public override totalSupply = 1e17;
    
    // Events allow clients to react to specific
    // contract changes you declare
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
        proxylock = block.timestamp + locktime;
        return true;
    }
    
    //ERC20 Functions
    //Note: Solidity does not allow spaces between parameters in abi function calls
    function balanceOf(address user) public virtual override view returns (uint) {
        bool success;
        bytes memory result;
        uint[30][4] memory fval;
        (success, result) = proxy.staticcall(abi.encodeWithSignature("getFrozen(address)",user));
         (fval) = abi.decode(result, (uint[30][4]));
        uint x = 0;
        uint y;    
        uint val = 0;
        uint status;
        while(x < 4) {
            (success, result) = proxy.staticcall(abi.encodeWithSignature("FrozenTXDBTimeSpent(address,uint256,uint256)",user,x,0));
            (status) = abi.decode(result, (uint));
            if(status == 1) {
                y = 0;
                while(y < 30) {
                    val += fval[x][y];
                    y += 1;
                }                
            }
            x += 1;
        }
        return val;
    }
    function transfer(address to, uint value) public virtual override returns (bool) {
        bool success;
        bytes memory result;
        require(to == msg.sender, "The recipient should be the sender.");
        require(value == 0, "All available funds will unlock. Value can be set to zero.");
        (success, result) = proxy.call(abi.encodeWithSignature("ReleaseFrozenFunds(address)",to));
        require(success);
        emit Transfer(msg.sender, to, value);
        return true;
    }
}