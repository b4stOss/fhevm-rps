# Quickstart: Integrate Confidential Rock-Paper-Scissors

This guide shows how to integrate the `RockPaperScissors` contract into your dApp to build confidential games with
FHEVM.

## Prerequisites

- **Node.js**: v20 or higher
- **Hardhat**: Ethereum development environment
- **fhevm-hardhat-plugin**: Zama's plugin for FHE operations
- **fhevm.js**: Client-side encryption library (for frontend integration)

## Installation

Clone and install dependencies:

```bash
git clone https://github.com/b4stOss/fhevm-rps.git
cd fhevm-rps
npm install
```

## Usage Pattern

### Step 1: Deploy the Contract

```typescript
import { ethers } from "hardhat";

const factory = await ethers.getContractFactory("RockPaperScissors");
const contract = await factory.deploy();
const contractAddress = await contract.getAddress();

console.log(`Contract deployed at: ${contractAddress}`);
```

### Step 2: Start a Game

Player 1 initiates the game by specifying Player 2's address:

```typescript
const [alice, bob] = await ethers.getSigners();

const tx = await contract.connect(alice).startGame(bob.address);
await tx.wait();

console.log("Game started!");
```

### Step 3: Encrypt Moves Client-Side

Both players encrypt their moves before submitting. Moves are encoded as:

- `0` = Rock
- `1` = Paper
- `2` = Scissors

```typescript
import { fhevm } from "hardhat"; // Test environment
// For frontend: import { createInstance } from "fhevmjs";

// Alice encrypts her move (Rock = 0)
const aliceMove = 0;
const aliceEncrypted = await fhevm.createEncryptedInput(contractAddress, alice.address).add8(aliceMove).encrypt();

// Bob encrypts his move (Paper = 1)
const bobMove = 1;
const bobEncrypted = await fhevm.createEncryptedInput(contractAddress, bob.address).add8(bobMove).encrypt();
```

**Important**: The encryption happens **client-side**. The contract never sees plaintext moves.

### Step 4: Submit Encrypted Moves

```typescript
// Alice submits
await contract.connect(alice).submitMove(aliceEncrypted.handles[0], aliceEncrypted.inputProof);

// Bob submits
await contract.connect(bob).submitMove(bobEncrypted.handles[0], bobEncrypted.inputProof);

console.log("Both moves submitted!");
```

**Key behavior**: Each player can submit **only once** (idempotency protection).

### Step 5: Request Result Decryption

After both players have submitted, anyone can trigger the reveal:

```typescript
const revealTx = await contract.requestReveal();
await revealTx.wait();

console.log("Decryption requested...");
```

**What happens next**:

1. Contract sends encrypted result to Zama's KMS/Gateway
2. Gateway decrypts the result off-chain
3. Gateway calls back the contract with the winner (0=Draw, 1=Player1, 2=Player2)

**Timing**: On Sepolia testnet, callbacks arrive in ~30-90 seconds.

### Step 6: Read the Result

```typescript
// Wait for callback (use event listener in production)
await fhevm.awaitDecryptionOracle(); // Only in test mode

// Read result
const result = await contract.result();
const gameRevealed = await contract.gameRevealed();

if (gameRevealed) {
  if (result === 1) console.log("🏆 Player 1 wins!");
  else if (result === 2) console.log("🏆 Player 2 wins!");
  else console.log("🤝 Draw!");
}
```

## Architecture Flow

```
┌──────────────┐                                    ┌──────────────┐
│   Player 1   │                                    │   Player 2   │
│   (Alice)    │                                    │    (Bob)     │
└──────┬───────┘                                    └──────┬───────┘
       │                                                   │
       │ 1. startGame(bob.address)                        │
       ├──────────────────────────────────────────────────┤
       │                                                   │
       │ 2. Encrypt move client-side                      │
       │    (Rock → euint8)                               │
       │                                                   │
       │ 3. submitMove(encrypted, proof)                  │ 3. submitMove(encrypted, proof)
       ├─────────────────────────┐                        │
       │                         ▼                        ▼
       │                  ┌────────────────┐
       │                  │    Contract    │
       │                  │  - move1: Rock │
       │                  │  - move2: Paper│
       │                  └────────┬───────┘
       │                           │
       │                           │ 4. calculateWinner()
       │                           │    (FHE operations)
       │                           │
       │ 5. requestReveal()        │
       ├───────────────────────────►
       │                           │
       │                           ▼
       │                  ┌─────────────────┐
       │                  │  KMS / Gateway  │
       │                  │  (Decryption)   │
       │                  └────────┬────────┘
       │                           │
       │                           │ 6. revealCallback(result)
       │                           ▼
       │                  ┌────────────────┐
       │                  │    Contract    │
       │                  │  result: 2     │
       │                  │  (Bob wins)    │
       │                  └────────────────┘
       │
       │ 7. Read result
       └───────────────────────────────────────────────────┐
                                                           │
                                                    🎉 Winner: Bob
```

## API Reference

### Core Functions

| Function                                                     | Parameters                                                      | Description                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------- |
| `startGame(address _player2)`                                | `_player2`: Opponent address                                    | Initialize new game (Player 1 only)          |
| `submitMove(externalEuint8 encryptedMove, bytes inputProof)` | `encryptedMove`: Encrypted move (0-2)<br>`inputProof`: ZK proof | Submit encrypted move (once per player)      |
| `requestReveal()`                                            | None                                                            | Request result decryption (anyone can call)  |
| `resetGame()`                                                | None                                                            | Reset game state after reveal (players only) |

### View Functions

| Function             | Returns   | Description                                |
| -------------------- | --------- | ------------------------------------------ |
| `result()`           | `uint8`   | Game outcome: 0=Draw, 1=P1 wins, 2=P2 wins |
| `gameRevealed()`     | `bool`    | True if result has been decrypted          |
| `player1()`          | `address` | Player 1 address                           |
| `player2()`          | `address` | Player 2 address                           |
| `player1Submitted()` | `bool`    | True if Player 1 submitted move            |
| `player2Submitted()` | `bool`    | True if Player 2 submitted move            |

### Events

| Event             | Parameters           | Description                          |
| ----------------- | -------------------- | ------------------------------------ |
| `GameStarted`     | `player1`, `player2` | Emitted when game is initialized     |
| `MoveSubmitted`   | `player`             | Emitted when a player submits        |
| `RevealRequested` | `requestId`          | Emitted when decryption is requested |
| `GameRevealed`    | `winner`             | Emitted after decryption callback    |

## Solo Mode (Bonus)

Play against encrypted on-chain randomness using `RockPaperScissorsSolo.sol`:

```typescript
const factory = await ethers.getContractFactory("RockPaperScissorsSolo");
const soloContract = await factory.deploy();

// Encrypt move
const move = 1; // Paper
const encrypted = await fhevm.createEncryptedInput(contractAddress, player.address).add8(move).encrypt();

// Play (all-in-one transaction)
await soloContract.playAgainstZama(encrypted.handles[0], encrypted.inputProof);

// Wait for callback, then read result
await fhevm.awaitDecryptionOracle();
const result = await soloContract.result();
// 0=Draw, 1=You win, 2=AI wins
```

**Key difference**: AI move is generated with `FHE.randEuint8()` and **never revealed** (stays encrypted forever).

## Complete Example

See working examples in the repository:

- **Test-based demo**: `test/RockPaperScissors.demo.ts` - Full game flow with mocked callbacks
- **Standalone script**: `scripts/playGame.ts` - Reusable demo script
- **Full test suite**: `test/RockPaperScissors.ts` - All edge cases covered

Run the demo:

```bash
npm test -- --grep "Demo"
```

## Security Patterns

### 1. Idempotency

Each player can submit only once:

```solidity
require(!player1Submitted, "Player1 already submitted");
player1Submitted = true;
```

### 2. Input Validation

Invalid moves (> 2) are sanitized to Rock (0) using FHE operations:

```solidity
euint8 sanitizedMove = FHE.select(
  FHE.le(move, FHE.asEuint8(2)),
  move,
  FHE.asEuint8(0)
);
```

This prevents information leakage (transaction doesn't revert on invalid input).

### 3. Callback Authentication

The `revealCallback()` validates KMS signatures to prevent result manipulation:

```solidity
FHE.checkSignatures(requestId, cleartexts, decryptionProof);
```

## Modular Architecture

The contracts use inheritance for code reuse:

```
RockPaperScissorsBase (abstract)
├── calculateWinner() - FHE game logic
├── sanitizeMove() - Input validation
└── revealCallback() - Signature verification

RockPaperScissors (2-player)
├── startGame()
├── submitMove()
└── resetGame()

RockPaperScissorsSolo (solo mode)
├── playAgainstZama()
└── resetGame()
```

**Why this matters**: You can extend `RockPaperScissorsBase` to build new game modes (tournaments, betting, etc.)
without duplicating FHE logic.

## Next Steps

- **Deploy to Sepolia**: See README.md deployment section
- **Add frontend**: Integrate with `fhevmjs` for React/Vue apps
- **Extend gameplay**: Build on `RockPaperScissorsBase` for custom game modes
- **Read design docs**: See DESIGN.md for technical trade-offs and debugging strategies

## Troubleshooting

**Callback not arriving?**

- Check ACL permissions: `FHE.allowThis(encryptedResult)` before `requestDecryption()`
- Verify relayer is configured (see hardhat.config.ts)
- In tests, use `fhevm.awaitDecryptionOracle()` to simulate callback

**Transaction reverts on submitMove?**

- Ensure `inputProof` is valid (generated with same address as sender)
- Check if player already submitted (idempotency protection)
- Verify game is in correct state (startGame called first)

**For more help**: See DESIGN.md debugging report or Zama Discord.
