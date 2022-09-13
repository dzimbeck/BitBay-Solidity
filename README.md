All these votes should happen at predictable times so network can coordinate.
If for whatever reason a burn needs to use more than 248 characters it is
possible to add # once or multiple times after the **(symbol)** message 
to indicate the next output will be containing more information. So if you
say **B**## this means the next two 6a outputs are a continuation of the data
The exception to this is minting where the interpreter will scan 6a outputs
and not stop aggregating them until a normal address is seen.

It's recommended for changes to **N** and **T** that this is only done
by tier 1 or tier 2 trusted stakers

Change number of votes required for a change/approval:
**N**list letter and then [x,y,a]
X is top trusted stakers tier 1
Y is top trusted stakers tier 2
A is any other stakers
X/Y can incremented up to 1 at a time
A can be incremented up to 10 at at time
Maximum values are [50,50,100]

Add/remove top trusted staker:(these stakers authorize major proposals)
**T** first integer 1 or 2 (1st/2nd list) then another integer 1=add 2=remove followed by address
They can add/remove tier one or tier two list members

Add/remove exchange multisig account:
**X**1=add 2=remove followed by public key
This public key when used within a transaction such as multisignature can bypass any freezes

Add/remove bridge to solidity based network(X):
**B**1=add 2=remove then network data
Example of network data: {'n':'BSC Mainnet','s':'BNB','l':['https://bsc-dataseed.binance.org/'],'i':56,'c':'0x...'}
n=name,s=symbol,l=seed links,i=chainid,c=contract

Add merkle hash for injecting funds to/from network(X):
**M** then first 16 digits of the hash of the network name, followed by merkle hash
Also if message is hash of the word "pause" then all bridge transactions are temporarily declined
To resume from a pause publish the hash of the word "resume" (also to initiate bridge "resume" is sent)

Publish vote on someones behalf:
**S**{'k':[1 or 2 public keys],'s':signature of message hash with first pubkey,'m':message,'n':nonce}
This is used when someone is unable to stake or not enough people are voting at once.
In this case users might group their votes together and publish them later.
It only works for trusted stakers because tier 3 is based on chances to win a stake
A message hash may only be published once so it's published with a nonce
Only standard addresses or 2 of 2 multisig accounts are supported

Spending from another network:
**Y** followed by a json object of the merkle proof which will include the network name the root is contained in
proof['w'] = Network name hash [:16]
proof['n'] = Nonce
proof['f'] = From(corresponding network)
proof['a'] = Address(on BitBay)
proof['s'] = Section
proof['r'] = Reserve Shards
proof['t'] = Merkle Root
proof['p'] = Merkle Proof
The TXID is generated in this order: txhash(str([w,n(int),f,a,s(int),r(int...int...)])):0 and it is always a single input TX
The 6a messages start in output 1 so that position 0 is open for standard use
Then the leaf is generated the same as on the corresponding solidity network and the proof verified and input verified unspent
The 6a outputs that are spent on the proof should be pruned from the peg database

Spending to another network:
**Z** then first 16 digits of the hash of the network name, followed by the address to pay on that network

Minting from another network:
Any time where you look up TXID in the database, first query the output in index 1 (2nd output)
If that output contains 6a**Y** and the first 16 digits of a hashed bridge network then proceed as follows...
Iterate all of the outputs that follow as 6a and use them to build the merkle proof which is then verified
Note the output in position zero is left open for the user to spend the input as they want with any tags
Once the merkle is verified, the data in the reserve array can be decompressed and the best match from the bridge pool is found
Then the deductions are made from the bridge pool. Then the TXID in the input is verified to match some of the data from the object
Then a reference is added to the database that links the two transaction IDs together so one can look up the other. The inputs TXID
is basically a virtual one created from the corresponding network name and some specific data to the mint proof. When doing deductions
some indices may have been taken by other users (since peg data is compressed and decompressed) so find the "best match" of shards
The best match must have the funds in the specific compressed section as those are mixed liquidity. If not enough in the section decline it.
The signatures must match the recipient in the merkle proof and they may proceed to mint it anywhere they choose. If the users address
is a public key they have to use the first output that isn't 6a to show the script in a payment. This allows the transaction to verify.

RPC calls in bitbayd:
getmerkle(txid:o)
{'root':0x...,'proof':[0x...,0x...,0x...],'address':0x...,'txid':'tx:vout','reserve':[0,0,0,0,0...]}
returns the receipt needed to redeem the merkle proof on the corresponding network
will return false if the TXID is not found or if tree is not processed yet (any errors can display in debug.log)

getroot(nonce)
{'network1':{'root':0x...,'section':int},'network2':{'root':0x...,'section':int}...}
Shows the completed merkle roots for publishing them on their corresponding networks.
will return false if the nonce is not processed yet (any errors can display in debug.log)
It also publishes the precise section that was used in generating the root proof for each network

getmerklevotes()
{'network1':0x...,'network2':0x...}
Shows the merkle trees that have not yet confirmed to the BAY network. BAY nodes will then automatically vote on these while staking.
Will return empty dictionary if no votes are found

getrootbay(nonce)
{'network1':root,'network2':root}
Shows the merkle roots for minting to BAY for the nonce requested. If a corresponding network doesn't have that nonce it's not included

getbridgeinfo
[bridgeactive(bool), {'TrustedStakers1':[],'TrustedStakers2':[],'bridges'[{'n':'','s':'','l':[''...],'i':INT,'c':''}]...
,'exchanges':{pub1:1,pub2:1,pub3:1...},'N':[],'T':[],'X':[],'B':[],'M':[]}]

getbridgepool(network name)
returns pool of coins sent to that specific network [int1,int2...int1200]

showproofs(address)
[txid1, txid2, txid3...]
Shows the list of 6a transactions that appeared to contain a burn to a corresponding network.
This is useful for a user who resynced and wants to see their history.

Also getfractions should work with 6a**Z** outputs until pruned by nodes

In config file a new possible command:
prune6aZ=True(default=False)
This command is needed for any user who loses their merkle proof and they
need to resync and get the pool data for their bridged transactions.
When set any 6a**Z** txout pool data is pruned along with other 6a outputs that don't need shard data.

Bridge is incremental array with nonce(so each set works while another is merkled/cleared)
Calculating is done whenever nodes notice a tree has started and it's time to publish(once a day for example).
User can see if TX has been bridged yet by their receipt and if the merkle root has confirmed
When user sends a TX they wait until a receipt is generated from their inclusion in the tree. 
If they lose the merkle proof it's potentially difficult to recover unless they can recover 6a data.
The proof for minting on a solidity network is msg.sender, array of compressed shards, and txid:vout
The proof for minting on BitBay is the recipient, nonce, array of compressed shards, the users last active section and sender

GAS NOTES:
Coin = gas required * gas price in gwei * 0.000000001
Arrangement of 30-8-5
Based on 2022 costs:
Minting new coins from admin costs 1043724 gas ($100 on ETH, $2 on Binance, $0.05 on Polygon, $4.50 on Avax)
Changing supply (per curator) 165615 gas ($15 on ETH, $0.30 on Binance, $0.0075 on Polygon, $0.67 on Avax )
Sending Liquid coins when supply changes 1153201 gas ($100 on ETH, $2 on Binance, $0.05 on Polygon, $4.50 on Avax)
Sending Liquid coins when both users are updated 501692 gas ($50 on ETH, $1 on Binance, $0.025 on Polygon, $2.25 on Avax)
Sendering Reserve coins when users are updated 377684 gas ($35 on ETH, $0.70 on Binance, $0.0175 on Polygon, $1.575 on Avax)
Depositing liquidity to an AMM from 1.5m up to 3000000 gas ($300 on ETH, $6 on Binance, $0.15 on Polygon, $13.50 on Avax)
Withdawing liquidity to an AMM roughly 2m gas ($200 on ETH, $4 on Binance, $0.10 on Polygon, $9 on Avax)

Supply changes/votes may take place up to 3 times per day per account. So it may pay off to allow a super curator to lower cost for others.
Although all nodes should have enough funds to consider they may not be available. Curators may vote on issues such as Merkle trees.
Merkle tree voting may happen daily. Also there is curation costs of burning from Solidity chains to BAY.
When trading with certain AMMs it may be required to use a router contract for deposits, withdraws and possibly trades.
If an AMM has a zero balance(due to deflation or mixing), someone may have to send it funds in order to reactivate the pool.
Note that even when deflation makes a pair have lower liquidity, you can still get a fair mint because the amount given
is the lower number resulting from the ratio of your deposits. So there is no way to get more LP coins that you would on DAI/ETH/BNC side.
It should also be understood that a user should not send their LP tokens to another user or else they will be unable to withdraw.
The user will usually send both liquid and reserve to a deposit on a pair so that will automatically give them similar stake to other users.
The custom router also checks for a correct deposit by requiring minimum liquidity ratios.

The method for making sure users can share a liquidity pool while having specific shards while the system inflates and deflates
is made possible through the liquidity pool contract. This contract shows how to find a "best match" for each shard during a
withdraw. The match can be set to a limited precision to reduce gas costs. Users typically deposit both liquid and reserve
regardless of the pair they are bidding on. Although traditionally liquid and reserve are separate pools and funds won't move from
one pool to another unless a user manually withdraws liquidity and moves it to bid on the other pool. This allows a user to bid
more liquidity on the coin of their preference. Also because of the complexity of telling the difference between if new funds
were deposited during supply change or if coins were purchased or sold, the best way for a fair experience is to make sure
users deposit both types of BAY matching pool ratios to accomodate supply changes even though only one type is being sold
in that pool. Deposits could even be checked for multiple ranges of shards to make sure a deposit is premium.

In theory, a custom automated market maker and router could combine the liquid and reserve into a single pool by allowing two
different quotes and swaps. Either way, a user who deposits would likely have similar shards to other users depending on how
the purchases and sales distributed the DAI/ETH/BNC. Another technique may be to try and keep track of what a user deposits
versus the liquidity in the pool at the time and have a separate entry for purchases and sales. However, a system like that
would need to be careful to know times of purchases to avoid skimming the purchases before a deposit. Perhaps the best matching
algorithm could set a precision for a pool that agregates pools for different shard ranges. There is many unexplored ways
to try and maximize the efficiency of this system. Pools that allow the deposit of an exclusive set of coins (liquid or reserve)
without requiring the other are more complex. A simple order book for bulk purchases may be useful for users who need to
deposit to a pool that requires both liquid and reserve.

The BitBay contract contains logic for direct interaction with liquidity pools through router contracts. These are special contracts
that the community votes in that can pool user funds together and do fair withdraws from those pools. The data structure allows the
ability to deposit to a pool and register a users deposit shards, deposit to a pool without registering a user(a trade), checking
the balance of a user at a pool, withdrawing directly from a pool(buying) and withdrawing from a registered user(withdraw).
It also allows the management of LP tokens to let the system know how much of the pool they are given on their deposits.
There is no time delays for interacting with pools or when sending to a router.

With this system it should be possible to add other solidity based networks. Additionally most AMM exchanges based on UniSwap v2
should be compatible with BitBays contracts. However each AMM should be individually audited. Future custom routers may
be able to interact with other kinds of contracts by using the same system that is used by the exchanges. It is allowed for
routers to send any of their shards using the mint function provided it's in their balance. This allows for more efficient
and different kinds of routers that custom manage their own liquidity pools. Also liquidity mixing systems can be considered
for a future upgrades to BAY or as a side project for a smoother deflation while having some economic differences in equity.

For the trustless nature of this bridge while maintaining upgradability, the proxy contracts can be set so they can
only be changed during a long pause of the base contract to read the intentions of the voters. Furthermore, they can be
locked for any amount of time. Voting on supply can also be given to a smart contract which can follow algorithms enforced
by the users themselves. Merkle trees are listed and they should correspond to BAY network nodes. The data of some contracts
are not in a separate data contract. However, the users who interact with the contracts are listed and this way to
recover most of the relevant data you can iterate the list of users for liquidity pool and base contracts and for the
administration contract you can iterate nonces, curators and merkles. For the security side of bridge automation it
may not be feasable for stakers to run their own nodes for each bridged network. However it's a good idea for bitbayd
to give them that option. Either way, the default behavior of automation is for BitBay to check solidity data from
the list of nodes that were published through curation. In the javascript example, major decisions such as merkle
trees are checked to make sure all of the online nodes queried give matching results.

The curator system is decentralized so there is no primary governance and it should match BAYs top stakers as closely as possible.
Further smart contracts can be added to further refine what certain curators can do. In order to vote on relevant admin issues
the users should import the admin contract into remix(an free web based ETH interface) for the corresponding network and build it.
Once built, they can find out the address of the admin contract and load it and then call any commands the community agrees to vote on.

For the BitBay staking side, there is the similar aforementioned curation system. In Halo there is already a voting system in place.
Votes for merkle tree publishing to solidity networks is automated based on whatever bitbayd computes. The same is also true for
voting on the supply. In theory curator nodes can vote differently for supply on solidity networks. However, because supply generally
should match the desires of the community as a whole, it is also automated to follow the main BitBay network. When the curators
want to add or remove curators, bridges or make other important changes, they coordinate and carefully agree on the plain text
vote they wish to cast (6a**...). Halo already has a voting tab from previous builds. However there is no interface on the bridge
tab for more complex community management in the first release so that is coordinated over community channels. It may be that
at some point a more comprehensive user interface is made for administration in solidity and QT and Halo.

There is an entire user interface for all of the solidity bridges built on a single elegant webpage. This allows users to
see all kinds of account details and allows them to fully interact with exchanges like UniSwap or PancakeSwap. It also gives
them some advanced liquidity charts, interface for frozen funds, and an FAQ. It also has a bridge section for burning and minting.
The page itself is fully open source and for added security it can be downloaded and run from a users local machine.

Initially supported exchanges:
PancakeSwap v2
UniSwap Polygon
SushiSwap Polygon
Biswap