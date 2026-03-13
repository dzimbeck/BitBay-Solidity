# Treasury contracts code review

## Scope

Given report with recommendations for project: https://github.com/bitbaymarket/testing, revision: [d449dfb5d2b8181230a222be175b4a662a2fe100](https://github.com/bitbaymarket/testing/tree/d449dfb5d2b8181230a222be175b4a662a2fe100) of Feb 20, 2026

## Depth

Due to limited time spent on analysis this is not an audit of contracts to include covering of all features by unitests suite and proving the validity of all logic.

## Documentation

Missing documentation.

No NatSpec (`@notice`, `@param`, `@return`) is used in any contract. Inline `//` comments are sparse and inconsistent — present in LidoVault (section divider comments, HODL rationale block) but absent in most of Treasury.sol, Vault.sol, and StakingVote.sol. Key architectural decisions (e.g. why `depositVault` is called before `sendLiquid`, why `lastRefresh = 1` is used as a sentinel, what `varlock` protects) are undocumented at the code level. Events are missing on the most important state transitions (`depositVault`, `withdrawVault`, `claimRewards`, `refreshVault` — see L-5), which hampers off-chain monitoring and indexing. Deployment order and required post-deployment setup calls (e.g. `setPairedPool`, `setVault`, `lockVariables`) are not documented anywhere in the contracts.

## Code style

Several inconsistencies span the codebase:

- **Contract naming**: `autoBridge` (lowercase) vs `AutoBridge` (capitalized) for two versions of the same contract. Solidity convention is CapWords for contract names.
- **Access control pattern**: inline `require(msg.sender == minter)` is repeated in every guarded function across all contracts rather than using a shared modifier, leading to copy-paste duplication.
- **Reentrancy guard**: three different patterns — a `bool locked` flag in Treasury/LidoVault, a `bool lockVars` flag in autoBridge, nonReentrant in StableVault — instead of a single consistent approach (e.g. OpenZeppelin `ReentrancyGuard`).
- **Magic numbers**: `10000` (basis-point denominator), `3600` (max days), `90 days` (epoch length), and hardcoded mainnet addresses appear inline without named constants.
- **Pragma style**: `pragma solidity = 0.8.4` (exact pin) in 8 contracts, `0.8.30` in StableVault.sol. Exact pinning is reasonable for deployment, but the cross-file version gap is a maintenance concern (see L-4).
- **Error messages**: `require` strings are used throughout. Custom errors (`error Foo()`) introduced in Solidity 0.8.4 would reduce deploy/runtime gas and improve ABI clarity. 

## Findings

### Minter attack against voters

1. Community votes for a proposal the minter dislikes.
2. Proposal wins epoch like 138.
3. Minter calls changeEpochLength(300) before anyone calls confirmVotes(138).
4. Current epoch jumps to new number and confirmVotes(138) is permanently blocked.
5. Protocol governance is effectively controlled by the minter despite the voting mechanism.

Dev notes:
The long term intention is that the contract is it's own minter. However, a simple mitigation is to only allow epoch changes during registration period.

### Possible attack to harvestAndSwapToETH

There is possible attack scenario (may need more time to confirm - need deeper analyze and some unittest suite), though it looks as some possiblity of misuse the protocol:

Any account can call this function and force a harvest of protocol yield at up to **10% slippage**. The ETH is correctly sent to `treasuryProxy`, not the attacker, so there is no theft. However:

- The attacker forces the protocol to sell stETH at the worst allowed price (10% under market).
- This is a griefing attack that may destroys protocol value.
- The attacker can call repeatedly (between lock releases) if there is ongoing yield accumulation.

If the protocol has accumulated 10 stETH in yield (≈ $35,000 at $3500/ETH), a 10% slippage costs 1 stETH (≈ $3500). The attacker pays only gas. The protocol loses $3500 permanently with no ability to prevent it.

Dev notes:
This is true however Balancer is usually very liquid and that slippage will not occur. Furthermore, stakers are the ones to typically call it and they would
simply call the function earlier than the griefer. Balancer gets the best price regardless of the slippage set. So in this sense it is secure. Furthermore
it is best that all contracts are open so it stays fully decentralized and new stakers can always opt in.