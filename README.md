# BitBay Bridge

The BitBay decentralized bridge enables BitBay to access liquidity across DeFi protocols and decentralized exchanges. To interact with BitBay using MetaMask, you must add three separate contracts: `BAY`, `BAYR`, and `BAYF`. This coin is unlike any other project, so it's highly recommended to read this documentation first.  
You can access the bridge at [https://my.bitbay.market](https://my.bitbay.market).

## Overview

The major innovation in BitBay is its **dynamic peg**, which has the ability to solve supply and demand using **true deflation**. At the time of writing, it is the only coin in the world with the capability to deflate. With this ability, BitBay can do something unprecedented: **control its own economy in response to the users&#39; desires**.

Through voting, users can choose to make the currency:
- Resistant to volatility
- Pegged to a specific target price
- Responsive to synthetic targets (e.g. gold or BTC peaks)
- Stable to fiat (if the community chooses to)
- Run like a price action machine responding to algorithms

This system empowers users.

## DeFi and Liquidity

The ability to tap into DeFi lets BitBay take advantage of:
- Liquidity pools
- Automated market makers (AMMs)
- Staked assets
- Any mechanism that can bring liquidity

The peg requires custom code for exchange compatibility. Instructions are provided at this link. However, as DEXes are safer, **decentralized services are recommended**.

## How the Peg Works

Users&#39; balances are represented as **arrays**. When the **circulating supply index** changes:
- Coins equal to or above the index are **liquid**
- The remaining indices are **reserve**
- Every users array is unique
- Supply changes cause true changes in equity
- Users may buy/sell reserve and liquid coins separately

Reserve coins function like a **bond** or **forced savings account**, creating a **dual-coin system**: `BAY` and `BAYR`.

- Reserve coins sent during this state are **delayed for a month**
- `BAYF` represents frozen/delayed reserve arrays/coins.
- Different from **rebasing**, which doesn&#39;t change equity
- Different from **collateral-based tokens**, as no collateral is required

Changes in supply result in meaningful changes in user wealth. Rebasing coins are economically ineffective at controlling prices, since proportional ownership remains unchanged (e.g., 1/10 = 10/100). Collateral-backed stablecoins typically lack the flexibility to move in price. BitBay’s dynamic peg stands apart in that it can adjust price based on the collective will of its community, emulating real-world monetary systems. Bitcoin created the first blockchain, Ethereum created the first blockchain programming language, and BitBay created the first self-programming economy.

## Integration with UniSwap

The bridge has built-in detection for AMM pairs. This is essential to:
- Distinguish between trades, deposits, and withdrawals
- Prevent UniSwap from depositing or withdrawing without using the BitBay router

Why? Because during deflation:
- Users&#39; funds are set aside
- UniSwap would not recognize `BAYR` left behind
- A contract must be used to track LP tokens, pools, and user deposit arrays for fair payouts

## Contract Curation and Proxies

Contracts are organized using a system of proxy contracts. These can be locked after testing. Curators (typically long-standing community stakers) manage them and may eventually be replaced with contracts.

- Curators manage administration through voting on proposals
- Supply rate is currently matched by mainnet staker decisions
- Important changes are delayed for weeks to allow community review
- Merkle proofs are published with a delay so users may check them
- Curator contracts can further harden the security of bridge maintenance

Funds can be burned between BitBay mainnet and Solidity-based chains (e.g. Ethereum L2s, Polygon) with a preference for L2s due to gas cost.

## Security Provisions

- Fully open-source code
- Can be run natively via `pythonserver.bat` using Python
- Audited with reports available on GitHub
- Subject to future audits and unit testing
- Potential full transition to proxy-free autonomous architecture based on adoption

## BitBay Mainnet Functionality

Stakers vote with redundant security layers. Proposals are encoded as burn transactions (6a) and are used to create Merkle proofs.

Funds are pooled and minted/burned across networks using payouts that attempt to match arrays as closely as possible during conversion.

## Staking Commands

**Change number of votes required for change/approval:**  
&ast;&ast;N&ast;&ast; list letter and then [x,y,a]  
X = top trusted stakers tier 1, Y = tier 2, A = others  
Limits: X/Y increment 1, A increment 10. Max: [50,50,100]

**Add/remove top trusted staker:**  
&ast;&ast;T&ast;&ast; first integer 1 or 2 (list), then 1=add or 2=remove, followed by address

**Add/remove exchange multisig account:**  
&ast;&ast;X&ast;&ast; 1=add or 2=remove, followed by public key

**Add/remove bridge to Solidity network:**  
&ast;&ast;B&ast;&ast; 1=add or 2=remove, followed by:  
{&#39;n&#39;:&#39;BSC Mainnet&#39;,&#39;s&#39;:&#39;BNB&#39;,&#39;l&#39;:[&#39;https://bsc-dataseed.binance.org/&#39;],&#39;i&#39;:56,&#39;c&#39;:&#39;0x...&#39;}

**Add merkle hash for fund injection:**  
&ast;&ast;M&ast;&ast; then network name hash, followed by merkle hash and amount of funds minted

**Vote on someone&#39;s behalf:**  
&ast;&ast;S&ast;&ast; {&#39;k&#39;:[pubkeys],&#39;s&#39;:signature,&#39;m&#39;:message,&#39;n&#39;:nonce}  
Only tier 1/2 stakers, one-time message hash via nonce.

**Spending to another network:**  
&ast;&ast;Z&ast;&ast; followed by network name hash, followed by users personal 0x... address

**Burning back to BitBay:**  
Funds are credited automatically when the Merkle is voted on by the stakers.

## Innovations in Solidity Peg

The peg on BitBay mainnet is capable of reducing the circulating liquid supply from **1 billion coins** to **thousands**, using **1% compound increments** across **1200 indices**.

To handle this on Solidity:

- Arrays are a multi-dimensional factor to 1200 (e.g. `30 / 8 / 5`)
- Users&#39; "microshard" values are forgotten and mixed when supply leaves a larger section
- **Example:** `30` permanent sections × `8` mixable sections × `5` steps (1%^5)
- Mixing occurs when the index exits one section to enter another during inflation/deflation
- Balance updates happen by tracking the highest supply key since an account&#39;s last transaction
- Balances are updated individually for each user only when an interaction occurs

In this system it is important to consider the following:

- Users buying **premium deflated coins** experience **slower deflation**
- This results in every account being **unique**
- Some liquid payments for services might **deflate too fast**
- To handle this, front-end services should detect **sub-premium payments**
- **Advantage:** users can buy up premium coins during a liquidity crunch
- **Disadvantage:** system is **less intuitive** than fiat for day-to-day payments

## Liquid Mix Option

An alternate peg system has been prototyped, and the method has been discussed in several whitepapers. It is possible that BitBay could fork to this in the future, or that a full transition to Solidity could occur if demand for the project increases. The method is as follows:

- Smooth deflation for all users can occur by mixing liquid BAY into a single integer
- Precise calculations for balance updates can determine BAY and BAYR amounts
- No special premium liquid coins — premium liquid BAY becomes slightly more prone to deflation when mixed
- This creates greater demand for BAYR, as coins convert to true liquid coins when unlocked by inflation
- Better for purchases and services: users experience deflation slowly and collectively
- BAYR can be sold in a more granular, per-index way—similar to a futures or bonds market  
- This significantly reduces gas fees when supply changes are not occurring  
- Pools may require more complex code, and AMMs should behave more like spot markets with bulk peer-to-peer transactions
- The latest whitepaper covering this subject is available [here](https://bitbay.market/downloads/whitepapers/Protocol-owned-assets.pdf)

## Contract Compatibility

BitBay presents itself as an ERC-20 token but functions as a dual-coin system. As such:

- Sending to unknown contracts is restricted at the BAY/BAYR proxy level
- A validator contract allows future exceptions as new contract types are developed
- Developers should use the base "Data" contract along with the `CREATE2` method to generate user-specific deposit addresses and bypass restrictions
- Pooled accounts should generally be avoided to prevent shard mixing and unfair withdrawals

## Front-End Interface

- A simple, intuitive UI allows users to make payments, view liquid/reserve charts, interact with AMMs, and access bridge functions  
- Fully compatible with MetaMask, supporting balance detection for `BAY`, `BAYR`, and `BAYF`
- `BAYF` represents reserve coins that are in transit (subject to the one-month delay)
- Curators automatically sync popular AMM pairs on supply changes; users are prompted to sync pairs if needed before trading
- Coins can be minted or burned back and forth between the BitBay mainnet and supported chains via the bridge

## Links & Resources

- 📄 [Dynamic Peg Visual Explainer](https://github.com/bitbaymarket/website/blob/cc9cddf386bbdf8da9e97af4917f406bc16794b2/bitbay-dynamic-peg-visual-reference.pdf)  
- 🔒 [Audit Report](https://github.com/bitbaymarket/bridge/blob/main/bridge-audit-yshurik.zip)  
- 🔧 [Exchange Integration Guide](https://github.com/bitbaymarket/bitbay-doc-exchange)  
- 💻 [BitBay Website](https://bitbay.market)  
- 💬 [Join the Community on Telegram](https://t.me/bitbayofficial)