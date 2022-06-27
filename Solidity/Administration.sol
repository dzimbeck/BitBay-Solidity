// SPDX-License-Identifier: GPL-3.0
pragma solidity = 0.8.4;

interface IAdministration {
    function burn(address,uint256[38] memory,uint256) external;
}

contract Administration is IAdministration {
    // --- ERC20 Data ---
    string public constant name     = "BitBay Community";
    string public version  = "1";
       
    address public minter;
    uint public mintmode; //0 is bridge mode and 1 is testing mode
    uint public totalMinted;
    uint public totalSupply;
    address public proxy; //Where all the peg functions and storage are

    uint public totalvotes;
    uint public voteperc;
    uint[14] public votetimelimit;
    uint public maxweight;

    mapping (address => bool) public isCurator;
    mapping (bytes32 => uint[2]) public MerkleRoot;
    mapping (bytes32 => bool) public spent;
    mapping (bytes32 => uint[2]) public proposals; //Hash of proposal
    mapping (address => uint[14]) public myvotetimes; //Time limits to vote on specific things
    mapping (address => uint) public myweight;
    address[] public curators;

    //The safest method is to store the burn data persistently. To mint back to BAY we have to assume that
    //users may occasionally lose information about their burns. So from here they can recover it.
    mapping (uint => mapping(address => uint[38])) public BAYdata; //Merkle data for burns back to BAY
    mapping (uint => mapping(address => uint)) public highkey; //Last section registered
    mapping (uint => mapping(address => string)) public recipient;
    mapping (uint => mapping(address => uint)) public index; //Index in the merkle to update hash
    mapping (uint => mapping(address => bool)) public filled;
    mapping (address => string) public BAYaddress;
    mapping (address => uint) public regNonce;
    mapping (address => uint[]) public mynonces;
    mapping (uint => bytes32[]) public hashes;
    mapping (uint => address[]) public addresses; //Useful cross reference
    mapping (uint => uint) public processingTime;
    uint public nonce;
    uint public intervaltime = 43200; //12 hour batches of transactions. And stakers can wait a few hours to finalize data.
    
    uint public isActive = 1; //Initially proxies may be immediately changed
    bool public enableSpecialTX = false;
    bool public automaticUnfreeze = true;
    uint public proxylock;
    uint unlock = 0;

    event emitProposal(address from, uint myprop, bytes packed);

    //Any structure of majority and curators can be made this way. Also once volume picks up
    //it's always possible to incentivize the top list of holders on the Solidity networks
    //to participate in data validation by requiring a consensus in order to make advances.
    //Initially, the curators are based on the most active and trusted BAY holders and stakers.
    constructor() {
        minter = msg.sender;
        mintmode = 1;
        totalSupply = 1e17;
        myweight[msg.sender] = 100;
        isCurator[msg.sender] = true;
        curators.push(msg.sender);
        totalvotes += 100;
        voteperc = 55; //55 percent consensus
        uint x = 0;
        while(x < 12) {
            votetimelimit[x] = 120;
            x += 1;
        }
        votetimelimit[9] = 120; //Add merkle root
        maxweight = 100000;
    }

    //Safe math functions
    function mulDiv(uint x, uint y, uint z) internal pure returns (uint) {
      uint a = x / z; uint b = x % z; // x = a * z + b
      uint c = y / z; uint d = y % z; // y = c * z + d
      return a * b * z + a * d + b * c + b * d / z;
    }
    function add(uint x, uint y) internal pure returns (uint z) {
        require((z = x + y) >= x, 'ds-math-add-overflow');
    }
    function sub(uint x, uint y) internal pure returns (uint z) {
        require((z = x - y) <= x, 'ds-math-sub-underflow');
    }
    function mul(uint x, uint y) internal pure returns (uint z) {
        require(y == 0 || (z = x * y) / y == x, 'ds-math-mul-overflow');
    }

    //Unfortunately solidity limits the number of variables to a function so a struct is used here
    struct calcLocals {
        uint[38] reserve;
        uint highkey;
        uint supply;
        uint section;
        uint mk;
        uint pegsteps;
        uint pegrate;
        uint i;
        uint rval;
        uint liquid;
        uint newtot;
        uint k;
        uint j;
    }

    function changeMinter(address newminter) public returns (bool){
        require(msg.sender == minter);
        minter = newminter;
        return true;
    }

    function disableMinting() public returns (bool){
        require(msg.sender == minter);
        mintmode = 0;
        return true;
    }

    function lockProxies(uint locktime) public returns (bool){
        require(msg.sender == minter);
        proxylock += block.timestamp + locktime;
        return true;
    }

    function checkProposal(bytes32 myprop, uint mytype) private returns (bool){
        require(isCurator[msg.sender],"User is not a curator");
        require (block.timestamp >= myvotetimes[msg.sender][mytype],"Voting too frequently on proposal type");
        if (block.timestamp > proposals[myprop][1]) {
            proposals[myprop][1] = block.timestamp + votetimelimit[mytype];
            proposals[myprop][0] = 0;
        }        
        //Try to have voting times that aren't back to back, so users can time their votes early into the process
        myvotetimes[msg.sender][mytype] = block.timestamp + votetimelimit[mytype];
        proposals[myprop][0] = add(proposals[myprop][0], myweight[msg.sender]);
        if ((mul(proposals[myprop][0], 100) / totalvotes) >= voteperc) {
            return true;
        }
        return false;
    }

    //This will specify the BitBay contract
    function setProxy(address myproxy) public returns (bool){
        checkProxyLock();
        bytes32 proposal = keccak256(abi.encodePacked("setProxy",myproxy));
        bool res = checkProposal(proposal, 0);
        if (res) {            
            proxy = myproxy;
        }
        emit emitProposal(msg.sender, 0, abi.encodePacked("setProxy",myproxy));
        return res;
    }

    //This will change the admin contract so proceed with caution
    function changeAdminMinter(address targetproxy, address newminter) public returns (bool){
        checkProxyLock();
        bytes32 proposal = keccak256(abi.encodePacked("changeAdminMinter",targetproxy,newminter));
        bool res = checkProposal(proposal, 1);
        if (res) {
            bool success;
            bytes memory result;
            (success, result) = targetproxy.call(abi.encodeWithSignature("changeMinter(address)",newminter));
            require(success);
        }
        emit emitProposal(msg.sender, 1, abi.encodePacked("changeAdminMinter",targetproxy,newminter));
        return res;
    }

    function changecurator(address curator, uint weight) public returns (bool){        
        require(add(weight, 1) <= add(maxweight, 1));
        require(weight >= 0);
        bytes32 proposal = keccak256(abi.encodePacked("changecurator",curator, weight));
        bool res = checkProposal(proposal, 2);
        if (res) {            
            if (weight == 0) {
                isCurator[curator] = false;
                totalvotes = sub(totalvotes, myweight[curator]); 
            } else {
                isCurator[curator] = true;
                totalvotes = add(totalvotes, weight);
                curators.push(curator);
            }
            myweight[curator] = weight;
        }
        emit emitProposal(msg.sender, 2, abi.encodePacked("changecurator",curator, weight));
        return res;
    }
    
    function changeBAYProxy(address newproxy, bool status) public returns (bool){
        checkProxyLock();
        bytes32 proposal = keccak256(abi.encodePacked("changeProxy",newproxy,status));
        bool res = checkProposal(proposal, 3);
        if (res) {
            bool success;
            bytes memory result;
            (success, result) = proxy.call(abi.encodeWithSignature("changeProxy(address,bool)",newproxy,status));
            require(success);
        }
        emit emitProposal(msg.sender, 3, abi.encodePacked("changeProxy",newproxy,status));
        return res;
    }
    
    function setActive(bool status) public returns (bool){
        bytes32 proposal = keccak256(abi.encodePacked("setActive",status));
        bool res = checkProposal(proposal, 4);
        if (res) {
            bool success;
            bytes memory result;
            (success, result) = proxy.call(abi.encodeWithSignature("setActive(bool)",status));
            if(status == true) {
                isActive = 0; //This makes it so to change proxies all contracts must be locked for some time
            }
            if(status == false) {
                isActive = block.timestamp + 1814400; //Everything must be paused for 3 weeks to update the contract
            }
            require(success);
        }
        emit emitProposal(msg.sender, 4, abi.encodePacked("setActive",status));
        return res;
    }
    
    function enableSpecial(bool status) public returns (bool){
        bytes32 proposal = keccak256(abi.encodePacked("enableSpecial",status));
        bool res = checkProposal(proposal, 5);
        if (res) {
            bool success;
            bytes memory result;     
            (success, result) = proxy.call(abi.encodeWithSignature("enableSpecial(bool)",status));
            require(success);
            enableSpecialTX = status;
        }
        emit emitProposal(msg.sender, 5, abi.encodePacked("enableSpecial",status));
        return res;
    }
    
    function setAutomaticUnfreeze(bool status) public returns (bool){
        bytes32 proposal = keccak256(abi.encodePacked("setAutomaticUnfreeze",status));
        bool res = checkProposal(proposal, 6);
        if (res) {
            bool success;
            bytes memory result;
            (success, result) = proxy.call(abi.encodeWithSignature("setAutomaticUnfreeze(bool)",status));
            require(success);
            automaticUnfreeze = status;
        }
        emit emitProposal(msg.sender, 6, abi.encodePacked("setAutomaticUnfreeze",status));
        return res;
    }
    
    function setSupply(uint supply, address[] memory sync) public returns (bool){
        bytes32 proposal = keccak256(abi.encodePacked("setSupply",supply));
        bool res = checkProposal(proposal, 7);
        if (res) {
            bool success;
            bytes memory result;
            (success, result) = proxy.call(abi.encodeWithSignature("setSupply(uint256)",supply));
            require(success);
            uint len = sync.length;
            uint x = 0;
            while(x < len) {
                (success, result) = proxy.call(abi.encodeWithSignature("syncAMM(address)",sync[x]));
                require(success);
                x += 1;
            }
        }
        emit emitProposal(msg.sender, 7, abi.encodePacked("setSupply",supply));
        return res;
    }

    function setvoteperc(uint myperc) public returns (bool){
        bytes32 proposal = keccak256(abi.encodePacked("setvoteperc",myperc));
        bool res = checkProposal(proposal, 8);
        if (res) {            
            voteperc = myperc;
        }
        emit emitProposal(msg.sender, 8, abi.encodePacked("setvoteperc",myperc));
        return res;
    }

    function addMerkle(bytes32 mysha, uint section) public returns (bool){
        bytes32 proposal = keccak256(abi.encodePacked("addMerkle",mysha,section));
        bool res = checkProposal(proposal, 9);
        if (res) {
            MerkleRoot[mysha][0] = 1;
            MerkleRoot[mysha][1] = section;
        }
        emit emitProposal(msg.sender, 9, abi.encodePacked("addMerkle",mysha,section));
        return res;
    }

    //Custom routers are needed to set temporary variables to authorize correct AMM trades
    //Since users choose to use these exchanges they can also audit new routers.
    function changeRouter(address myAMM, bool status) public returns (bool){
        bytes32 proposal = keccak256(abi.encodePacked("changeRouter",myAMM,status));
        bool res = checkProposal(proposal, 10);
        if (res) {
            bool success;
            bytes memory result;
            (success, result) = proxy.call(abi.encodeWithSignature("changeRouteraddress,bool)",myAMM,status));
            require(success);
        }
        emit emitProposal(msg.sender, 10, abi.encodePacked("changeRouter",myAMM,status));
        return res;
    }

    function setLiquidityPool(address LP) public returns (bool){
        checkProxyLock();
        bytes32 proposal = keccak256(abi.encodePacked("setLiquidityPool",LP));
        bool res = checkProposal(proposal, 11);
        if (res) {
            bool success;
            bytes memory result;
            (success, result) = proxy.call(abi.encodeWithSignature("changeLiquidityPool(address)",LP));
            require(success);
        }
        emit emitProposal(msg.sender, 11, abi.encodePacked("setLiquidityPool",LP));
        return res;
    }

    function changeProposalTimeLimit(uint pos, uint mytime) public returns (bool){
        bytes32 proposal = keccak256(abi.encodePacked("setTimeLimit",pos,mytime));
        bool res = checkProposal(proposal, 12);
        if (res) {
            votetimelimit[pos] = mytime;
        }
        emit emitProposal(msg.sender, 12, abi.encodePacked("setTimeLimit",pos,mytime));
        return res;
    }

    //This will change the admin contract so proceed with caution
    function changeTargetProxy(address targetproxy, address newminter) public returns (bool){
        checkProxyLock();
        bytes32 proposal = keccak256(abi.encodePacked("changeTargetProxy",targetproxy,newminter));
        bool res = checkProposal(proposal, 13);
        if (res) {
            bool success;
            bytes memory result;
            (success, result) = targetproxy.call(abi.encodeWithSignature("setProxy(address)",newminter));
            require(success);
        }
        emit emitProposal(msg.sender, 13, abi.encodePacked("changeTargetProxy",targetproxy,newminter));
        return res;
    }

    function checkProxyLock() private view {
        require(proxylock < block.timestamp);
        require(isActive != 0);
        require(isActive < block.timestamp);
    }

    function verify(bytes32 root, bytes32 leaf, bytes32[] memory proof) public pure returns (bool){
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];

            if (computedHash <= proofElement) {
                // Hash(current computed hash + current element of the proof)
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                // Hash(current element of the proof + current computed hash)
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        // Check if the computed hash (root) is equal to the provided root
        return computedHash == root;
    }

    function redeemTX(bytes32 root, bytes32[] memory proof, uint[38] memory reserve, string memory txid) public returns (bytes32){
        bytes32 leaf = keccak256(abi.encode(msg.sender,reserve,txid));
        require(verify(root, leaf, proof), "Merkle proof was not valid");
        require(MerkleRoot[root][0] == 1, "Merkle root not found");
        require(spent[leaf] == false, "Transaction already spent");
        require(reserve[MerkleRoot[root][1]] == 0, "Microshard section not set properly");
        spent[leaf] = true;
        bool success;
        bytes memory result;
        (success, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
        calcLocals memory a;
        uint deflationrate;
        (a.supply,a.pegsteps,a.mk,a.pegrate,deflationrate) = abi.decode(result, (uint,uint,uint,uint,uint));
        a.section = a.supply / a.mk;
        a.newtot = 0;
        a.i = 0;
        a.liquid = 0;
        if (a.section != MerkleRoot[root][1]) {
            while(a.i < a.mk) {
                a.newtot = add(a.newtot, reserve[a.pegsteps + a.i]);
                reserve[a.pegsteps + a.i] = 0;
                a.i += 1;
            }
            reserve[MerkleRoot[root][1]]= a.newtot;
            if (reserve[a.section] != 0) {
                a.i = 0;
                a.newtot = add(reserve[a.section], 1);
                a.newtot = sub(a.newtot, 1);
                reserve[a.section] = 0;
                //It's okay to divide microshards evenly because liquid/reserve ratios don't precisely convert between networks on the bridge either way
                //This is because BAY network has many more shards and the microshards system is done to save in storage costs
                a.liquid = a.newtot / a.mk;
                while (a.i < a.mk - 1) {
                    a.newtot -= a.liquid;
                    reserve[a.pegsteps + a.i] += a.liquid;
                    a.i += 1;
                }
                reserve[a.pegsteps + a.i] += a.newtot; //Last section gets whatever is left over
            }
        }
        
        (success, result) = proxy.call(abi.encodeWithSignature("mint(address,uint256[38])",msg.sender,reserve));
        require(success);
        return leaf;
    }

    function mintNew(address receiver, uint amount) public returns (uint[38] memory){
        require(mintmode == 1);
        require(msg.sender == minter);
        require(add(totalMinted, amount) <= totalSupply);
        totalMinted = add(totalMinted, amount);
        bool success;
        bytes memory result;
        (success, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));        
        calcLocals memory a;
        uint deflationrate;
        (a.supply,a.pegsteps,a.mk,a.pegrate,deflationrate) = abi.decode(result, (uint,uint,uint,uint,uint));
        uint[38] memory reserve;
        a.section = a.supply / a.mk;
        a.i = 0;
        a.j = 0;
        a.k = a.supply % a.mk;
        a.liquid = 0;
        a.newtot = amount;
        uint tot;
        uint j;
        uint temp;
        while (a.i < a.pegsteps) {
            if (a.i == a.section) {
                while (a.j < a.mk) {
                    a.liquid = a.newtot - (a.newtot * (deflationrate ** (100 - a.pegrate))) / (100 **  (100 - a.pegrate)); //Use safe math here?!
                    a.newtot -= a.liquid;
                    reserve[a.pegsteps + a.j] += a.liquid;
                    tot += a.liquid;
                    a.j += 1;
                }
            }
            else {
                j=0;
                temp=0;
                while (j < a.mk) {
                    a.liquid = a.newtot - (a.newtot * (deflationrate ** (100 - a.pegrate))) / (100 **  (100 - a.pegrate)); //Use safe math here?!                    
                    a.newtot -= a.liquid;
                    temp += a.liquid;
                    j += 1;
                }
                reserve[a.i] += temp;
                tot += temp;
            }
            a.i += 1;
        }
        uint remainder = sub(amount, tot);
        if(remainder > 0) {
            tot += remainder;
            if(a.section == a.pegsteps - 1) {
                reserve[a.pegsteps + a.mk - 1] += remainder;
            } else {
                reserve[a.pegsteps - 1] += remainder;
            }
            
        }
        require(tot == amount, "Calculation error");
        (success, result) = proxy.call(abi.encodeWithSignature("mint(address,uint256[38])",receiver,reserve));
        require(success);
        return reserve;
    }

    function burn2(address sender, uint256[] memory reserve, uint section) external {
        require(msg.sender == proxy);
        uint x = 0;
        uint[38] memory reserve2;
        while(x < 38) {
            reserve2[x] = reserve[x];
            x += 1;
        }
        unlock = 1;
        burn(sender, reserve2, section);        
    }

    function burn(address sender, uint256[38] memory reserve, uint section) public virtual override {
        require(msg.sender == proxy || unlock == 1);
        unlock = 0;
        require(bytes(BAYaddress[sender]).length != 0, "Please register your burn address.");
        calcLocals memory a;
        if(nonce == 0 && processingTime[nonce] == 0) {
            processingTime[nonce] = block.timestamp;
        }
        if(processingTime[nonce] + intervaltime < block.timestamp) {
            nonce += 1; //Start making a new tree
            processingTime[nonce] = block.timestamp;
        }
        if(filled[nonce][sender] == false) {            
            BAYdata[nonce][sender] = reserve;
            highkey[nonce][sender] = section;
            recipient[nonce][sender] = BAYaddress[sender];
            index[nonce][sender] = addresses[nonce].length;
            filled[nonce][sender] = true;
            mynonces[sender].push(nonce);
            hashes[nonce].push(keccak256(abi.encode(BAYaddress[sender],reserve,section,nonce)));
            addresses[nonce].push(sender);
        } else {
            bytes memory result;
            a.section = highkey[nonce][sender];
            a.reserve = BAYdata[nonce][sender];
            (, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
            (a.supply,a.pegsteps,a.mk,a.pegrate,) = abi.decode(result, (uint,uint,uint,uint,uint));
            if (section != a.section) {
                while(a.i < a.mk) {
                    a.newtot = add(a.newtot, a.reserve[a.pegsteps + a.i]);
                    a.reserve[a.pegsteps + a.i] = 0;
                    a.i += 1;
                }
                a.reserve[a.section]= a.newtot;
                if (a.reserve[section] != 0) {
                    a.i = 0;
                    a.newtot = add(a.reserve[section], 1);
                    a.newtot = sub(a.newtot, 1);
                    a.reserve[section] = 0;
                    //It's okay to divide microshards evenly because liquid/reserve ratios don't precisely convert between networks on the bridge either way
                    //This is because BAY network has many more shards and the microshards system is done to save in storage costs
                    a.liquid = a.newtot / a.mk;
                    while (a.i < a.mk - 1) {                        
                        a.newtot -= a.liquid;
                        a.reserve[a.pegsteps + a.i] += a.liquid;
                        a.i += 1;
                    }
                    a.reserve[a.pegsteps + a.i] = a.newtot; //Last section gets whatever is left over
                }
            }
            a.i = 0;
            while(a.i < a.pegsteps + a.mk) {
                reserve[a.i] = add(reserve[a.i], a.reserve[a.i]);
                a.i += 1;
            }
            BAYdata[nonce][sender] = reserve;
            highkey[nonce][sender] = section;
            recipient[nonce][sender] = BAYaddress[sender];
            require(addresses[nonce][index[nonce][sender]] == sender);
            hashes[nonce][index[nonce][sender]] = keccak256(abi.encode(BAYaddress[sender],reserve,section,nonce));
        }
    }

    function register(string memory addy) public {
        require(regNonce[msg.sender] != nonce || bytes(BAYaddress[msg.sender]).length == 0, "Please wait until the next merkle to change address.");
        regNonce[msg.sender] = nonce;
        BAYaddress[msg.sender] = addy;
    }

    function listNonces(address user) public view returns(uint[] memory) {        
        return mynonces[user];
    }

    function showReserve(address user, uint mynonce) public view returns(uint[38] memory) {        
        return BAYdata[mynonce][user];
    }

    function listHashes(uint mynonce) public view returns(bytes32[] memory) {        
        return hashes[mynonce];
    }
}