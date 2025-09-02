autoTradeABI = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "destination",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "assumedPricePOL",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "assumedPriceBAY",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "slippagePOL",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "slippageBAY",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "routerV2",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "factory",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "bayToken",
				"type": "address"
			}
		],
		"name": "tradePOLtoBAY",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "destination",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "assumedPrice",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "slippage",
				"type": "uint256"
			},
			{
				"internalType": "bool",
				"name": "toBAY",
				"type": "bool"
			}
		],
		"name": "tradePOLtoDAI",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "router",
		"outputs": [
			{
				"internalType": "contract ISwapRouterV3",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]