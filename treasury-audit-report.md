---
title: Security Audit Report
client: BitBay Market
project: testing
commit: d449dfb
network: Ethereum, Polygon
report_date: February 22, 2026
authors:
  - name: undeclared
    email: undeclaredx@proton.me
---

# Cover
**Client:** BitBay Market
**Project:** Treasury & Staking System
**Date:** 2026.02.22
**Commit / Deployment:** d449dfb
**Compiler versions:** Solidity 0.8.30 (StableVault), 0.8.4 (all other contracts)

---
# Executive Summary (Problem)
- **Business context:** BitBay operates a multi-chain treasury and staking protocol across Ethereum and Polygon, managing user deposits, reward distribution, governance voting, stablecoin liquidity provisioning, and cross-chain bridging.
- **Problem statement:** Vulnerabilities in reward accounting, governance execution, or fund management could result in loss of user funds, manipulation of staking rewards, or unauthorized governance actions.
- **Overall risk posture:** Moderate. Several low-severity issues were identified
- **Key outcomes:** 0 critical, 0 high, 4 low (see summary table)

> We review design assumptions, economic safety, and implementation correctness. We do not speculate; every claim is backed by evidence (code, transactions, or tests).

## Scope
- **In-scope contracts/modules:** `Vault.sol`, `Treasury.sol`, `StableVault.sol`, `StakingVote.sol`, `LidoVault.sol`, `autoBridge.sol`, `flow.sol`
- **Out of scope:** External dependencies (Uniswap, Lido, Curve, Polygon PoS bridge), off-chain infrastructure
- **Chains / Networks:** Ethereum mainnet (`LidoVault.sol`, `autoBridge.sol`), Polygon (`Treasury.sol`, `Vault.sol`, `StableVault.sol`, `StakingVote.sol`, `flow.sol`)

## Methodology
- Manual code review (spec-first)
- AI-assisted analysis with follow-up manual verification
- Pattern matching against known vulnerability classes (reentrancy, access control, integer issues, state inconsistency)

---

# Findings Summary
| ID | Severity | Title | Affected | Status |
|----|----------|-------|----------|--------|
| F-001 | Low | Permanent 1-way variable lock with no timelock delay | autoBridge.sol:44-48 | Open |
| F-002 | Low | `lastRefresh = 1` bypasses authorization and skips top staker update | Treasury.sol:176,198 | Open |
| F-003 | Low | `_settle` sends USDC to user instead of `sendTo` recipient | StableVault.sol:204 | Fixed |
| F-004 | Low | Arbitrary call execution in governance with no target whitelist | StakingVote.sol:158-182 | Open |

---

## F-001 — Permanent 1-way variable lock with no timelock delay

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Affected** | `autoBridge.sol:44-48` |
| **Status** | Open |

### Description

`autoBridge.sol` uses a simple boolean `lockVars` that, once set to `true`, can never be reverted. Unlike other contracts in the suite that use a time-based `varlock` pattern, this contract has no grace period and no unlock mechanism. Once `lockVariables()` is called, `setRecipient()` and `setMinAmount()` are permanently disabled.

### Code

```solidity
bool public lockVars;

function lockVariables() external {
    require(msg.sender == minter, "not minter");
    require(!lockVars, "already locked");
    lockVars = true;  // Permanent, no unlock
}
```

### Impact

If triggered accidentally or if operational requirements change (e.g., Polygon bridge infrastructure changes), the contract loses all admin configurability permanently. Combined with the immutable `minter` address, this creates a rigid, unrecoverable state.

### Recommendation

Consider adopting the time-based `varlock` pattern used in other contracts, or add a multi-step lock process (propose → wait → confirm) to prevent accidental permanent lockout.

---

## F-002 — `lastRefresh = 1` bypasses authorization and skips top staker update

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Affected** | `Treasury.sol:176,198` |
| **Status** | Open |

### Description

The value `lastRefresh = 1` is used as a special flag. When set, `refreshVault()` skips the `require(user == msg.sender)` authorization check (line 176) and skips `_updateTopStakers()` (line 198). This flag is set by `depositVault()`/`withdrawVault()` before calling `refreshVault()`. The dual purpose of `lastRefresh` as both a timestamp and a control flag creates subtle coupling.

### Code

```solidity
// Line 176-178: Authorization bypass
if(accessPool[user].lastRefresh != 1 && msg.sender != pairedPool) {
    require(user == msg.sender);
}

// Line 198-200: Skips top staker update
if(accessPool[user].lastRefresh != 1) {
    _updateTopStakers(user, accessPool[user].shares);
}
```

### Impact

The `lastRefresh = 1` flag serves as a per-user state that controls both authorization and staker ranking logic. While deposit/withdraw paths set this before calling `refreshVault()` and handle `_updateTopStakers` separately, the overloaded semantics make the code fragile and error-prone for future modifications. If a code path sets `lastRefresh = 1` without subsequently calling `_updateTopStakers`, staker rankings become stale.

### Recommendation

Introduce a separate boolean or enum for the "called from vault" context rather than overloading the timestamp field. Alternatively, use an internal function variant that explicitly skips authorization.

---

## F-003 — `_settle` sends USDC to user instead of `sendTo` recipient

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Affected** | `StableVault.sol:204` |
| **Status** | Fixed |

### Description

In the `FeeVault._settle()` function, DAI is sent to the `sendTo[user]` recipient (line 203), but USDC is always sent to `user` directly (line 204). This inconsistency breaks the fee redirection mechanism when a user has called `changeSendTo()`.

### Code

```solidity
address recipient = sendTo[user];
// ...
if (owedDAI > 0) DAI.transfer(recipient, owedDAI);   // Line 203: Goes to recipient
if (owedUSDC > 0) USDC.transfer(user, owedUSDC);     // Line 204: Always goes to user!
```

### Impact

Users who configure a `sendTo` address expect all fee distributions to route to that address. USDC fees will always go to the original user regardless of the `sendTo` setting, creating inconsistent behavior and potentially breaking integrations that rely on fee redirection (e.g., routing fees to a liquidity pair).

### Recommendation

Change line 204 to send USDC to `recipient` instead of `user`:
```solidity
if (owedUSDC > 0) USDC.transfer(recipient, owedUSDC);
```

### Dev notes

This has been fixed. Originally it was intended to send donations to liquidity pools. However users should be able to donate the USDC in addition to DAI to
other contracts or recipients.

---

## F-004 — Arbitrary call execution in governance with no target whitelist

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Affected** | `StakingVote.sol:158-182` |
| **Status** | Open |

### Description

`_executePayload()` executes arbitrary external calls from winning governance proposals. The triplet payload (signature, target, args) allows calling any address with any function selector. Failed calls are caught and logged but do not revert the transaction, meaning partial execution of multi-call proposals can occur.

### Code

```solidity
function execCall(bytes calldata sigData, bytes calldata targetData, bytes calldata argsData)
    external returns (bool) {
    require(msg.sender == address(this), "self only");
    string memory sig = abi.decode(sigData, (string));
    address target = abi.decode(targetData, (address));
    bytes memory args = abi.decode(argsData, (bytes));
    (bool ok, ) = target.call(abi.encodePacked(bytes4(keccak256(bytes(sig))), args));
    return ok;
}
```

### Impact

While the system relies on stakers only voting for trusted proposals, a malicious proposal that wins an epoch can execute arbitrary calls from the contract's context. The try/catch pattern means partial execution can leave the system in an inconsistent state.

### Recommendation

Consider implementing a target whitelist or restricting callable function selectors. At minimum, document the trust assumptions clearly and consider requiring a minimum quorum or time delay before execution.

### Dev notes

This is somewhat intentional. The idea is for the voting to be fully decentralized and allow new users to opt in while emulating how proof of stake works with the incentive being the cash from the treasury. Typically target contracts should control the voting thresholds independently often requiring multiple rounds of winning votes with high amounts of coins staked for important decisions. Whereas less concerning decisions such as supply change may occur every interval simply based on the winning stakes. By not having a whitelist stakers can make all kinds of interesting protocols.

---