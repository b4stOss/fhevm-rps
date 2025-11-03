# Design Document - Rock Paper Scissors FHE

This document covers the technical design decisions, debugging strategies, and reflections for the Rock-Paper-Scissors
FHEVM implementation.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Request Integrity & Idempotency](#request-integrity--idempotency)
3. [Debugging Report](#debugging-report)
4. [Key Trade-offs](#key-trade-offs)
5. [Reflection](#reflection)

---

## Architecture Overview

### Modular Design with Abstract Base Contract

The implementation uses **inheritance-based modularity** to enable code reuse across game modes:

```
RockPaperScissorsBase (abstract)
├── RockPaperScissors (2-player mode)
└── RockPaperScissorsSolo (solo mode vs encrypted AI)
```

**Base contract** (contracts/RockPaperScissorsBase.sol) provides:

- FHE game logic: `calculateWinner()` - 9 FHE operations implementing RPS rules
- Input sanitization: `sanitizeMove()` - Clamps invalid inputs using FHE.select()
- Callback handling: `revealCallback()` - Validates KMS signatures
- Abstract functions: `resetGame()`, `getWinnerAddress()` - Implemented by children

**Why this architecture?**

- ✅ DRY principle: Shared logic lives in one place
- ✅ Extensibility: New game modes (tournaments, betting) don't duplicate code
- ✅ No regression risk: Adding solo mode didn't break 2-player tests
- ✅ Testability: Independent test suites per mode

### Solo Mode: FHE Randomness

The **RockPaperScissorsSolo** contract implements a stretch goal: playing against on-chain encrypted randomness.

**Key implementation details:**

**1. One-transaction flow**

```solidity
function playAgainstZama(externalEuint8 encryptedMove, bytes calldata inputProof) {
    move1 = sanitizeMove(FHE.fromExternal(encryptedMove, inputProof));

    // Generate encrypted random move with near-uniform distribution
    euint8 randomValue = FHE.randEuint8(); // [0, 255]
    move2 = FHE.rem(randomValue, 3); // Map to [0, 2] - using scalar for gas efficiency

    euint8 encryptedResult = calculateWinner();
    FHE.requestDecryption(...);
}
```

**2. Uniform randomness with modulo operation**

`FHE.randEuint8(bound)` requires `bound` to be a power of 2. To achieve near-uniform distribution for [0, 2]:

- Generate `FHE.randEuint8()` → [0, 255] (full range)
- Apply modulo 3: `FHE.rem(randomValue, 3)` → [0, 2]

**Distribution:**

- Rock (0): 33.59% (86 out of 256 values)
- Paper (1): 33.20% (85 out of 256 values)
- Scissors (2): 33.20% (85 out of 256 values)

**Bias: ~0.39%** (256 mod 3 = 1)

**Gas optimization note:** Using scalar operand (`3` instead of `FHE.asEuint8(3)`) saves gas on the modulo operation.

**3. Privacy guarantee**

The AI's encrypted move (`move2`) is **never decrypted**, preserving confidentiality forever. Only the final result
(Win/Lose/Draw) is revealed.

---

## Request Integrity & Idempotency

### Problem Statement

The game must guarantee:

1. Each player submits **exactly once** (idempotency)
2. Moves cannot be changed after submission (integrity)
3. Decryption callback executes **exactly once** (no replay)
4. Results are cryptographically authentic (no manipulation)

### Implementation

#### 1. Submission Idempotency

**Challenge**: Players might retry transactions or attempt to change moves.

**Solution** (contracts/RockPaperScissors.sol:58-62,74-80):

```solidity
if (msg.sender == player1) {
    require(!player1Submitted, "Player1 already submitted");
    player1Submitted = true;
} else {
    require(!player2Submitted, "Player2 already submitted");
    player2Submitted = true;
}
```

Boolean flags act as idempotency keys. Transaction reverts on duplicate submission.

**Trade-off**: Once submitted, players cannot correct mistakes (strict but fair).

#### 2. Reveal Request Lock

**Challenge**: Concurrent reveal requests could corrupt state or waste gas.

**Solution** (contracts/RockPaperScissors.sol:90,105):

```solidity
require(!isDecryptionPending, "Decryption already in progress");
isDecryptionPending = true;
```

Global lock ensures only one decryption at a time. Lock released in `revealCallback()`.

#### 3. Callback Authenticity

**Challenge**: `revealCallback()` is public (required for Gateway). Without validation, attackers could inject fake
results.

**Solution** (contracts/RockPaperScissorsBase.sol:107-116):

```solidity
function revealCallback(uint256 requestId, bytes memory cleartexts, bytes memory decryptionProof) public {
  require(requestId == latestRequestId, "Invalid request ID");
  FHE.checkSignatures(requestId, cleartexts, decryptionProof);
  // Process result
}
```

**Defense layers**:

1. **Request ID validation**: Anti-replay protection
2. **Signature verification**: `FHE.checkSignatures()` validates KMS cryptographic signatures
3. **ZK proof validation**: Proves decryption correctness

Without these checks, anyone could call the callback with fabricated results.

#### 4. Input Validation via FHE Sanitization

Traditional `require()` statements leak information when validating encrypted inputs (revert/success reveals data
properties).

**Solution**: Use FHE operations to sanitize invalid inputs without information leakage:

```solidity
euint8 sanitizedMove = FHE.select(
    FHE.le(move, FHE.asEuint8(2)),  // isValid = move <= 2
    move,                            // If valid: keep move
    FHE.asEuint8(0)                 // If invalid: clamp to 0 (Rock)
);
```

Transaction **always succeeds**, preventing timing attacks. Invalid moves are silently replaced with a fallback value.

See test coverage: test/RockPaperScissors.ts:248-275 (sanitization test).

---

## Debugging Report

### Scenario: Decryption Callback Never Arrives (Testnet)

#### The Problem

I deploy to Sepolia, call `requestReveal()`, transaction succeeds with a `RevealRequested` event... but the callback never
triggers. After 5 minutes, `gameRevealed` is still `false` and the game is stuck.

**Important context**: This only happens on testnet. In local Hardhat mock mode, `awaitDecryptionOracle()` simulates
callbacks instantly, so you never see this issue during development.

#### How I'd Debug This

**First instinct: Check ACL permissions**

This is the #1 cause of callback failures in FHEVM. The Gateway needs permission to decrypt the result before it can
send it back. I'd verify I called `FHE.allowThis(encryptedResult)` before `requestDecryption()`.

Quick check: Add a temporary view function to the contract:

```solidity
function debugACL() public view returns (bool) {
  return FHE.isAllowed(encryptedResult, address(this));
}
```

If this returns `false`, that's my problem. Fix: ensure the code has `FHE.allowThis(encryptedResult)` right before
requesting decryption.

**Second: Verify the request actually went through**

Check Sepolia block explorer for the transaction to confirm the `RevealRequested` event was emitted with a valid
`requestId`. If there's no event, the issue is in my contract logic, not the Gateway.

**Third: Check if it's an infrastructure issue**

Look at Sepolia explorer to see if other contracts' decryption requests are being processed (search for recent
`DecryptionOracle` events). If nothing network-wide is working, the Gateway/KMS might be down or congested.

Also verify the relayer has enough ETH to pay for callback gas (needs >0.01 ETH typically).

**Last resort: Callback signature mismatch**

Double-check my callback function signature exactly matches what FHEVM expects:

```solidity
function revealCallback(uint256 requestId, bytes memory cleartexts, bytes memory decryptionProof) public
```

Any typo in parameter types would silently fail.

#### Validation

Once I fix the issue (likely adding the missing `FHE.allowThis()`):

1. Redeploy to Sepolia
2. Run a full game flow
3. Wait 30-120 seconds (normal callback time on testnet)
4. Verify `gameRevealed()` returns `true`

For production, I'd also add a timeout mechanism so games don't stay stuck forever if something goes wrong with the
Gateway.

#### Key Takeaway

ACL permissions are critical and easy to forget. In mock mode everything works without them, but on testnet the Gateway
actually enforces permissions. Always test on Sepolia before assuming everything works.

---

## Key Trade-offs

### 1. Single Game vs Multi-Game Factory

**Decision**: Single-game contract with manual `resetGame()`.

**Rationale**:

- ✅ Simpler for demonstration
- ✅ Lower deployment gas
- ❌ Only one active game at a time
- ❌ Not scalable for production

**Alternative**: Factory pattern deploying new instances per game.

**For production**: Use factory or game ID mapping to support concurrent games.

### 2. Player Selection: Pre-defined vs Open Lobby

**Decision**: Player1 selects Player2 by address at game start.

**Rationale**:

- ✅ Simple and deterministic
- ✅ Prevents griefing (no random players hijacking games)
- ❌ Requires off-chain coordination to exchange addresses

**Trade-off**: Security vs convenience. Pre-defined players prevent frontrunning.

**Decision**: Only decrypt final result (winner), **not** individual moves.

**Rationale**:

- ✅ Maximum privacy: Player moves remain forever encrypted on-chain
- ✅ Gas efficient: Single decryption request
- ✅ Fairness: Neither player can see opponent's move before committing

**Alternative**: Decrypt both moves post-game for transparency.

**Trade-off**: Privacy over transparency. For auditing, could add optional move decryption.

### 3. Reset Mechanism: Stateful Reuse vs New Contract

**Decision**: Manual `resetGame()` resets plaintext state for contract reuse.

**Why this works with encrypted data**:

1. Ciphertext handles (`move1`, `move2`) get overwritten on next game
2. Submission flags prevent accessing stale ciphertexts
3. No information leakage (old ciphertexts remain encrypted)

**Security**:

- ✅ Access control: Only previous players can reset
- ✅ State validation: Can only reset after reveal
- ✅ Test coverage: Multiple sequential games work (test/RockPaperScissors.ts:144)

**Alternative**: Factory pattern (clean slate per game).

**Trade-off**: Demo-friendly reuse vs production scalability.

### 4. Input Sanitization: Revert vs FHE Clamping

**Decision**: Use `FHE.select()` to clamp invalid moves to fallback value (Rock).

**Rationale**:

- ✅ Zero information leakage (transaction always succeeds)
- ✅ Prevents timing attacks (revert/success reveals data properties)
- ❌ Silent failure: Player unaware of invalid input

**Alternative**: Client-side validation + contract rejection.

**Trade-off**: Security over user feedback. Production apps need client-side UX validation.

---

## Reflection

### If I Had More Time

**1. Testnet Deployment (Sepolia)**

Development was limited to **local Hardhat network** to optimize development speed and avoid testnet friction (faucet
hunting, transaction delays, etc.). While the code should theoretically work on Sepolia, deployment would require deeper
configuration.

**2. Multi-Game Factory Pattern** Current design allows one active game per deployed contract. A factory pattern would
enable:

- Concurrent games on same deployment
- Better scalability for production
- Game isolation (failures don't affect other games)

**Why not implemented**: Out of scope for core requirement. The modular architecture makes this extension
straightforward.

**2. Frontend Integration**

- Build React dApp using `fhevm-react-template`
- Integrate `fhevm.js` for client-side encryption
- Real-time game updates via event listeners
- MetaMask/WalletConnect integration

### AI Coding Assistance

I used **Claude and ChatGPT** for this project.

#### ✅ What Worked Well

**1. Test / Task Scaffolding**

- Generated comprehensive test structure with setup/teardown
- Suggested edge cases I hadn't considered (idempotency, input sanitization)
- Handled FHEVM test helpers correctly

**2. Documentation**

- Produced detailed NatSpec comments
- Generated structured DESIGN.md, DOCUMENTATION.md and README.md sections
- Helped articulate complex FHE concepts clearly

**4. Debugging**

- Provided debugging strategies for FHEVM-specific issues

#### ❌ What Didn't Work Well

**FHEVM API Specifics**

- Overall, AI models are not really aware/up to date on FHEVM so I needed to manually study the Zama documentation to
  understand the key concepts and effectively guide Claude.

---

## Conclusion

This Rock-Paper-Scissors implementation demonstrates core FHEVM concepts: encrypted computation, ACL management,
asynchronous decryption, and request integrity. The modular architecture with abstract base contract enables code reuse
and extensibility.
