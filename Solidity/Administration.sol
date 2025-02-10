// SPDX-License-Identifier: Coinleft Public License for BitBay
pragma solidity = 0.8.4;

interface IAdministration {
    function burn(address,uint256[38] memory,uint256) external;
}

contract Administration is IAdministration {
    string public constant name = "BitBay Community";
    string public version = "1";
       
    address public minter;
    uint public mintmode; //0 is bridge mode and 1 is testing mode
    uint public totalMinted;
    uint public totalSupply;
    address public proxy; //Where all the peg functions and storage are
    address public poolProxy;
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
    mapping (uint => uint) public startingtime;
    address[] public curators;

    //The safest method is to store the burn data persistently. To mint back to BAY we have to assume that
    //users may occasionally lose information about their burns. So from here they can recover it.
    mapping (uint => mapping(address => uint64[38])) public BAYdata; //Merkle data for burns back to BAY
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
    uint public timeLimit = 15552000; //Curators should be encouraged to stay active
    uint public startingNonce = 0; //Increment this by a billion for each new bridge to keep hashes unique    
    bool public enableSpecialTX = false;
    bool public automaticUnfreeze = true;
    uint[2][7] public proxylock;
    bytes32[] public Merkles; //This can be validated by looking at the BitBay network.
    mapping (bytes32 => uint) public MerkleConfirm; //Gives time for users to react to a bad Merkle
    uint unlock = 0;

    struct ProxyChangeRequest {
        uint256 timestamp;
        uint8 changeType;
        address newProxy;
        bool status;
        address targetProxy;
    }
    ProxyChangeRequest[] public delayedChanges;
    uint public delayTime;
    uint public lastProxyPosition;

    event emitProposal(address from, uint myprop, bytes packed);

    //Any structure of majority and curators can be made this way. Also once volume picks up
    //it's always possible to incentivize the top list of holders on the Solidity networks
    //to participate in data validation by requiring a consensus in order to make advances.
    //Initially, the curators are based on the most active and trusted BAY holders and stakers.
    constructor() {
        nonce = startingNonce;
        minter = msg.sender;
        mintmode = 1;
        totalSupply = 1e17;
        myweight[msg.sender] = 100;
        isCurator[msg.sender] = true;
        curators.push(msg.sender);
        totalvotes += 100;
        voteperc = 55; //55 percent consensus
        uint x = 0;
        while(x < 14) {
            votetimelimit[x] = 5400;
            x += 1;
        }
        maxweight = 100000;
        delayTime = 7257600; //3 month delay for major proxy changes
    }

    //Solidity limits the number of variables to a function so a struct is used here
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

    function store64(uint[38] memory input) private pure returns (uint64[38] memory output) {
        for (uint i; i < 38; i++) {
            if (input[i] > type(uint64).max) revert();
            output[i] = uint64(input[i]);
        }
    }

    function get64(uint64[38] memory input) private pure returns (uint[38] memory output) {
        for (uint i; i < 38; i++) {
            output[i] = uint(input[i]);
        }
    }

    function changeMinter(address newminter) public returns (bool){
        require(msg.sender == minter || msg.sender == address(this));
        require(newminter != address(this));
        minter = newminter;
        return true;
    }

    function disableMinting() public returns (bool){
        require(msg.sender == minter);
        mintmode = 0;
        return true;
    }

    function changeLiquidityPool(address newpool) public returns (bool){
        if(poolProxy==address(0)) {
            require(msg.sender == minter || msg.sender == address(this));
            poolProxy = newpool;
        } else {
            require(msg.sender == address(this));
            poolProxy = newpool;            
        }
        return true;
    }

    function lockProxies(uint locktime, uint pos) public returns (bool){
        require(msg.sender == minter);
        require(proxylock[pos][0] < block.timestamp);
        if(proxylock[pos][1] < 3) {
            require(locktime < 7257600);
            require(locktime > 1209600);
        }
        proxylock[pos][0] = block.timestamp + locktime;
        proxylock[pos][1] += 1;
        return true;
    }

    function removeCurator(address curator, bool reset) public returns (bool){
        require(msg.sender == minter || isCurator[msg.sender]);
        if(reset == true && msg.sender == minter) {
            if(myvotetimes[curator][0] + (votetimelimit[0] * 10) < block.timestamp) {
                myvotetimes[curator][0] = block.timestamp;
            }
            return true;
        }
        uint x = 0;
        while (x < 14) {
            if (myvotetimes[curator][x] + timeLimit > block.timestamp) {
                return false;
            }
            x += 1;
        }
        isCurator[curator] = false;
        totalvotes = totalvotes - myweight[curator];
        myweight[curator] = 0;
        require(totalvotes != 0);
        return true;
    }

    function checkProposal(bytes32 myprop, uint mytype) private returns (bool){
        require(isCurator[msg.sender],"User is not a curator");
        require (block.timestamp >= myvotetimes[msg.sender][mytype],"Voting too frequently on proposal type");
        if (block.timestamp > proposals[myprop][1]) {
            proposals[myprop][1] = block.timestamp + votetimelimit[mytype];
            proposals[myprop][0] = 0;
        }
        if (startingtime[mytype] + ((votetimelimit[mytype] * 15) / 10) < block.timestamp) {
            startingtime[mytype] = block.timestamp;
        }
        require(proposals[myprop][0] != 1,"Voting is complete and will reset after the time limit");
        //Try to have voting times that aren't back to back, so users can time their votes early into the process
        myvotetimes[msg.sender][mytype] = block.timestamp + votetimelimit[mytype];
        proposals[myprop][0] = proposals[myprop][0] + myweight[msg.sender];
        if (((proposals[myprop][0] * 100) / totalvotes) >= voteperc) {
            proposals[myprop][0] = 1;
            return true;
        }
        return false;
    }

    //This will specify the BitBay contract
    function setProxy(address myproxy) public returns (bool){
        require(proxylock[0][0] < block.timestamp);
        bytes32 proposal = keccak256(abi.encodePacked("setProxy",myproxy));
        bool res = checkProposal(proposal, 0);
        if (res) {
            if(proxy==address(0)) {
                proxy = myproxy;
            } else {
                delayedChanges.push(ProxyChangeRequest(block.timestamp + delayTime, 0, myproxy, true, address(0)));
            }
        }
        emit emitProposal(msg.sender, 0, abi.encodePacked("setProxy",myproxy));
        return res;
    }

    //This will change the admin contract so proceed with caution
    function changeAdminMinter(address targetproxy, address newminter) public returns (bool){
        require(proxylock[1][0] < block.timestamp);
        bytes32 proposal = keccak256(abi.encodePacked("changeAdminMinter",targetproxy,newminter));
        bool res = checkProposal(proposal, 1);
        if (res) {
            delayedChanges.push(ProxyChangeRequest(block.timestamp + delayTime, 1, newminter, true, targetproxy));
        }
        emit emitProposal(msg.sender, 1, abi.encodePacked("changeAdminMinter",targetproxy,newminter));
        return res;
    }

    function changecurator(address curator, uint weight) public returns (bool){        
        require(weight <= maxweight);
        require(weight >= 0);
        require(weight != 1);
        bytes32 proposal = keccak256(abi.encodePacked("changecurator",curator, weight));
        bool res = checkProposal(proposal, 2);
        if (res) {            
            if (weight == 0) {
                isCurator[curator] = false;
                totalvotes = totalvotes - myweight[curator];
            } else {
                if(isCurator[curator] == false) {
                    curators.push(curator);
                }
                isCurator[curator] = true;
                totalvotes = totalvotes - myweight[curator];
                totalvotes = totalvotes + weight;
            }
            myweight[curator] = weight;
        }
        emit emitProposal(msg.sender, 2, abi.encodePacked("changecurator",curator, weight));
        return res;
    }
    
    function changeBAYProxy(address newproxy, bool status) public returns (bool){
        require(proxylock[2][0] < block.timestamp);
        bytes32 proposal = keccak256(abi.encodePacked("changeProxy",newproxy,status));
        bool res = checkProposal(proposal, 3);
        if (res) {
            delayedChanges.push(ProxyChangeRequest(block.timestamp + delayTime, 3, newproxy, status, address(0)));
        }
        emit emitProposal(msg.sender, 3, abi.encodePacked("changeProxy",newproxy,status));
        return res;
    }
    
    function setActive(bool status) public returns (bool){
        if(proxylock[3][1] > 3) {
            require(proxylock[3][0] < block.timestamp);
        }
        bytes32 proposal = keccak256(abi.encodePacked("setActive",status));
        bool res = checkProposal(proposal, 4);
        if (res) {
            bool success;
            bytes memory result;
            (success, result) = proxy.call(abi.encodeWithSignature("setActive(bool)",status));
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
                (success, result) = poolProxy.call(abi.encodeWithSignature("syncAMM(address)",sync[x]));
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
            Merkles.push(mysha);
            MerkleConfirm[mysha] = block.timestamp + (intervaltime * 2);
        }
        emit emitProposal(msg.sender, 9, abi.encodePacked("addMerkle",mysha,section));
        return res;
    }

    //Custom routers are needed to set temporary variables to authorize correct AMM trades
    //Since users choose to use these exchanges they can also audit new routers.
    function changeRouter(address myAMM, bool status) public returns (bool){
        require(proxylock[4][0] < block.timestamp);
        bytes32 proposal = keccak256(abi.encodePacked("changeRouter",myAMM,status));
        bool res = checkProposal(proposal, 10);
        if (res) {
            delayedChanges.push(ProxyChangeRequest(block.timestamp + delayTime, 10, myAMM, status, address(0)));
        }
        emit emitProposal(msg.sender, 10, abi.encodePacked("changeRouter",myAMM,status));
        return res;
    }

    function setLiquidityPool(address targetProxy, address LP) public returns (bool){
        require(proxylock[5][0] < block.timestamp);
        bytes32 proposal = keccak256(abi.encodePacked("setLiquidityPool",targetProxy,LP));
        bool res = checkProposal(proposal, 11);
        if (res) {
            delayedChanges.push(ProxyChangeRequest(block.timestamp + delayTime, 11, LP, true, targetProxy));
        }
        emit emitProposal(msg.sender, 11, abi.encodePacked("setLiquidityPool",targetProxy,LP));
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

    //This will change the proxy contract of a target contract so proceed with caution
    function changeTargetProxy(address targetproxy, address newproxy) public returns (bool){
        require(proxylock[6][0] < block.timestamp);
        bytes32 proposal = keccak256(abi.encodePacked("changeTargetProxy",targetproxy,newproxy));
        bool res = checkProposal(proposal, 13);
        if (res) {
            delayedChanges.push(ProxyChangeRequest(block.timestamp + delayTime, 13, newproxy, true, targetproxy));
        }
        emit emitProposal(msg.sender, 13, abi.encodePacked("changeTargetProxy",targetproxy,newproxy));
        return res;
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
        require(MerkleConfirm[root] < block.timestamp, "Please wait for merkle to confirm");
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
                a.newtot = a.newtot + reserve[a.pegsteps + a.i];
                reserve[a.pegsteps + a.i] = 0;
                a.i += 1;
            }
            reserve[MerkleRoot[root][1]]= a.newtot;
            if (reserve[a.section] != 0) {
                a.i = 0;
                a.newtot = reserve[a.section];
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
        (success, result) = proxy.call(abi.encodeWithSignature("mint(address,uint[38])",msg.sender,reserve));
        require(success);
        return leaf;
    }

    function mintNew(address receiver, uint amount) public returns (uint[38] memory){
        require(mintmode == 1);
        require(msg.sender == minter);
        require((totalMinted + amount) <= totalSupply);
        totalMinted = totalMinted + amount;
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
        uint remainder = amount - tot;
        if(remainder > 0) {
            tot += remainder;
            if(a.section == a.pegsteps - 1) {
                reserve[a.pegsteps + a.mk - 1] += remainder;
            } else {
                reserve[a.pegsteps - 1] += remainder;
            }
            
        }
        require(tot == amount, "Calculation error");
        (success, result) = proxy.call(abi.encodeWithSignature("mint(address,uint[38])",receiver,reserve));
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
            BAYdata[nonce][sender] = store64(reserve);
            highkey[nonce][sender] = section;
            recipient[nonce][sender] = BAYaddress[sender];
            index[nonce][sender] = addresses[nonce].length;
            filled[nonce][sender] = true;
            mynonces[sender].push(nonce);
            hashes[nonce].push(keccak256(abi.encode(BAYaddress[sender],reserve,section,nonce,sender)));
            addresses[nonce].push(sender);
        } else {
            bytes memory result;
            a.section = highkey[nonce][sender];
            a.reserve = get64(BAYdata[nonce][sender]);
            (, result) = proxy.staticcall(abi.encodeWithSignature("getState()"));
            (a.supply,a.pegsteps,a.mk,a.pegrate,) = abi.decode(result, (uint,uint,uint,uint,uint));
            if (section != a.section) {
                while(a.i < a.mk) {
                    a.newtot = a.newtot + a.reserve[a.pegsteps + a.i];
                    a.reserve[a.pegsteps + a.i] = 0;
                    a.i += 1;
                }
                a.reserve[a.section]= a.newtot;
                if (a.reserve[section] != 0) {
                    a.i = 0;
                    a.newtot = a.reserve[section];
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
                reserve[a.i] = reserve[a.i] + a.reserve[a.i];
                a.i += 1;
            }
            BAYdata[nonce][sender] = store64(reserve);
            highkey[nonce][sender] = section;
            regNonce[sender] = nonce;
            recipient[nonce][sender] = BAYaddress[sender];
            require(addresses[nonce][index[nonce][sender]] == sender);
            hashes[nonce][index[nonce][sender]] = keccak256(abi.encode(BAYaddress[sender],reserve,section,nonce,sender));
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
        return get64(BAYdata[mynonce][user]);
    }

    function listHashes(uint mynonce) public view returns(bytes32[] memory) {
        return hashes[mynonce];
    }

    function showLimits()  public view returns(uint[14] memory) {
        return votetimelimit;
    }

    function merkleLen() public view returns(uint) {
        return Merkles.length;
    }

    function updateProxies() public returns(bool) {
        require(msg.sender == minter);
        uint i = lastProxyPosition;
        uint count;
        bool success;
        while (i < delayedChanges.length && count < 30) {
            ProxyChangeRequest storage request = delayedChanges[i];
            if (block.timestamp < request.timestamp) {
                break;
            }
            if (request.changeType == 0) {
                proxy = request.newProxy;
            }
            if (request.changeType == 1) {
                (success, ) = request.targetProxy.call(abi.encodeWithSignature("changeMinter(address)",request.newProxy));
            }
            if (request.changeType == 3) {
                (success, ) = proxy.call(abi.encodeWithSignature("changeProxy(address,bool)",request.newProxy,request.status));
            }
            if (request.changeType == 10) {
                (success, ) = proxy.call(abi.encodeWithSignature("changeRouter(address,bool)",request.newProxy,request.status));
            }
            if (request.changeType == 11) {
                (success, ) = request.targetProxy.call(abi.encodeWithSignature("changeLiquidityPool(address)",request.newProxy));
                poolProxy = request.newProxy;
            }
            if (request.changeType == 13) {
                (success, ) = request.targetProxy.call(abi.encodeWithSignature("setProxy(address)",request.newProxy));
            }
            i++;
            count++;
        }
        lastProxyPosition = i;
        return success;
    }
}