// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity = 0.8.4;

//WARNING: Do not assume this coin will operate the same with most standard contracts!
//This has an IERC20 interface but this is a completely revolutionary kind of coin with a variable supply.
//BitBay bridge codes things this way to be compatible with some popular AMM platforms and decentralized exchanges.
interface IHALO {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract BAYR is IHALO {
    // --- ERC20 Data ---
    string public constant name     = "BitBay Reserve";
    string public constant symbol   = "BAYR";
    string public version  = "1";
    uint public decimals = 8;
    bool public showCirculating = false;
    
    // Events allow clients to react to specific contract changes you declare
    event Approval(address indexed from, address indexed to, uint amount);
    event Transfer(address indexed from, address indexed to, uint amount);
    
    address public minter;
    address public proxy; //Where all the peg functions and storage are
    address public LiquidityPool;
    address public lockpair; //An exception to not revert a temporary reentry
    uint public proxylock;
    mapping (address => uint8) public checked; //Users should send to approved contracts or send through base contract
    mapping(address => uint) public nonces;
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    constructor() {
        minter = msg.sender;
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                address(this)
            )
        );
    }

    function changeMinter(address newminter) public {
        require(msg.sender == minter);
        if(newminter == address(0)) {
            if(showCirculating) {
                showCirculating = false;
            } else {
                showCirculating = true;
            }
            return;
        }
        minter = newminter;
    }

    function setProxy(address prox) public {
        require(block.timestamp > proxylock);
        require(msg.sender == minter);
        proxy = prox;
    }

    function setLiquidityPool(address prox) public {
        require(block.timestamp > proxylock);
        require(msg.sender == minter);
        LiquidityPool = prox;
    }

    function lockProxies(uint locktime) public returns (bool) {
        require(msg.sender == minter);
        proxylock = block.timestamp + locktime;
        return true;
    }

    function lockthis(address pair) public returns (bool) {
        require(msg.sender == LiquidityPool);
        lockpair = pair;
        return true;
    }

    //This check is to see if a user is sending to an unknown contract without knowing the nature of the peg and its    
    //effect on pools and transactions. They will get denied if they attempt to send this way. This method does not prevent
    //them from sending before the contract exists. If they must interact with contracts they should use the base contract.
    function checkAddress(address verify, bool checkSync) public returns (bool) {
        bool isRouter;
        bool success;
        bytes memory result;
        if(verify.code.length == 0) {
            return true;
        }
        if(checked[verify] == 1) {
            return true;
        }
        if(checked[verify] == 2) {
            return false;
        }
        if(checked[verify] == 3) {
            (success, result) = proxy.staticcall(abi.encodeWithSignature("isRouter(address)",verify));
            require(success);
            isRouter = abi.decode(result, (bool));
            if(isRouter) {
                (success, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
                require(success);
                (uint supply,,uint mk,,) = abi.decode(result, (uint,uint,uint,uint,uint));
                (success, result) = LiquidityPool.staticcall(abi.encodeWithSignature("poolhighkey()"));
                require(success);
                uint highkey = abi.decode(result, (uint));
                if(highkey != (supply / mk)) {
                    (success, result) = LiquidityPool.call(abi.encodeWithSignature("syncAMM((address)",verify));
                    require(success);
                }
            }
            return true;
        }
        if(checkSync) {
            return true;
        }
        if(verify == LiquidityPool || verify == minter) {
            checked[verify] = 1;
            return true;
        }
        (success, result) = proxy.staticcall(abi.encodeWithSignature("isAMMExchange(address)",verify));
        require(success);
        uint isAMM = abi.decode(result, (uint));
        if(isAMM == 1) {
            checked[verify] = 3;
            return true;
        } else {
            (success, result) = proxy.staticcall(abi.encodeWithSignature("minter()"));
            require(success);
            address isMinter = abi.decode(result, (address));
            if(isMinter == verify) {
                checked[verify] = 1;
                return true;
            } else {
                (success, result) = proxy.staticcall(abi.encodeWithSignature("isRouter(address)",verify));
                require(success);
                isRouter = abi.decode(result, (bool));
                if(isRouter) {
                    checked[verify] = 1;
                    return true;
                }
            }
        }
        checked[verify] = 2;
        return false;
    }

    //ERC20 Functions
    //Note: Solidity does not allow spaces between parameters in abi function calls
    function totalSupply() public virtual override view returns (uint supply) {
        supply = 1e17;
        uint remaining = supply;
        if(showCirculating) {
            (bool success, bytes memory result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
            require(success);
            (uint supply2,,,uint pegrate,) = abi.decode(result, (uint,uint,uint,uint,uint));
            for (uint i = 0; i < supply2; i++) {
                remaining = (remaining * (99**(100 - pegrate))) / (100**(100 - pegrate));  // Applying the deflation iteratively
            }
        }
        return supply - remaining;
    }

    function balanceOf(address user) public virtual override view returns (uint) {
        bool success;
        bytes memory result;
        (success, result) = proxy.staticcall(abi.encodeWithSignature("reserveBalanceOf(address,address)",user,msg.sender));
        require(success);
        uint rval = abi.decode(result, (uint));
        return rval;
    }

    function allowance(address owner, address spender) public virtual override view returns (uint) {
        bool success;
        bytes memory result;
        (success, result) = proxy.staticcall(abi.encodeWithSignature("allowanceReserve(address,address)",owner,spender));
        require(success);
        return abi.decode(result, (uint));
    }

    function approve(address spender, uint value) public virtual override returns (bool) {
        require(spender != address(0));
        bool success;
        bytes memory result;        
        (success, result) = proxy.call(abi.encodeWithSignature("approve(address,uint256,address,uint256)",spender,value,msg.sender,1));
        require(success);
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint value) public virtual override returns (bool) {
        if(msg.sender == lockpair) {
            lockpair = address(0);
            return true;
        }
        require(checkAddress(msg.sender,true));
        require(checkAddress(to,false));        
        uint[] memory a;
        bool success;
        bytes memory result;
        (success, result) = proxy.call(abi.encodeWithSignature("sendReserve(address,address,uint256,uint256[],uint256,address)",msg.sender,to,value,a,0,msg.sender));
        require(success);
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint value) public virtual override returns (bool) {
        if(msg.sender == lockpair) {
            lockpair = address(0);
            return true;
        }
        require(checkAddress(from,true));
        require(checkAddress(to,false));
        uint[] memory a;
        bool success;
        bytes memory result;
        (success, result) = proxy.call(abi.encodeWithSignature("sendReserve(address,address,uint256,uint256[],uint256,address)",from,to,value,a,0,msg.sender));
        require(success);
        emit Transfer(from, to, value);
        return true;
    }

    function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01",DOMAIN_SEPARATOR,keccak256(abi.encode(PERMIT_TYPEHASH,owner,spender,value,nonces[owner],deadline))));
        require(owner != address(0), "Invalid-address");
        require(owner == ecrecover(digest, v, r, s), "Invalid-permit");
        require(deadline == 0 || block.timestamp <= deadline, "Permit-expired");
        require(spender != address(0));
        nonces[owner]+=1;
        bool success;
        bytes memory result;
        (success, result) = proxy.call(abi.encodeWithSignature("approve(address,uint256,address,uint256)",spender,value,owner,1));
        require(success);
        emit Approval(owner, spender, value);
    }
}