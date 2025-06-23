// SPDX-License-Identifier: MIT
pragma solidity = 0.8.4;

contract Validator {
    address public minter;
    bool public allowAny;
    mapping(address => uint8) public contracts; //Useful for contracts that don't know how to handle shards

    constructor() {
        minter = msg.sender;
        allowAny = true;
    }

    function changeMinter(address newminter) public {
        require(msg.sender == minter);
        minter = newminter;
    }

    function setAllow(bool status) public {
        require(msg.sender == minter);
        allowAny = status;
    }

    function setAsThree(address addr) external {
        require(msg.sender == minter);
        contracts[addr] = 3;
    }

    function validate(address from, address verify, uint8 fromStatus, uint8 verifyStatus) external view returns (uint8) {
        if(contracts[from] == 3) {
            if (fromStatus != 1 && fromStatus != 2) return 3;    
        }
        if(contracts[verify] == 3) {
            if (verifyStatus != 1 && verifyStatus != 2) return 4;
        }
        if(allowAny) {
            if(fromStatus == 1 || fromStatus == 2) {
                return 5;
            }
        }
        return 0;
    }
}