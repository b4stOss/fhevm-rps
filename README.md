# Rock-Paper-Scissors with FHEVM

Confidential on-chain Rock-Paper-Scissors using Zama's Fully Homomorphic Encryption (FHE). Player moves remain encrypted
throughout the game, with only the final winner revealed publicly.

## What's This?

A minimal implementation demonstrating how to build confidential smart contracts with FHEVM:

- **2-player mode**: Both players submit encrypted moves, contract computes winner without decrypting individual choices
- **Solo mode**: Play against on-chain encrypted randomness (stretch goal)
- **Modular architecture**: Reusable base contract for FHE game logic

## Quick Start

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Run interactive demos
npm run demo:duo   # 2-player demo (Alice vs Bob)
npm run demo:solo  # Solo demo (Player vs Zama)

# Compile contracts
npm run compile
```

### See It In Action

Watch the interactive demos showing the full game flow:

```bash
# 2-player demo
npm run demo:duo
```

**Expected output:**

```
🎮 Rock Paper Scissors - FHE Demo
================================
👥 Players: Alice vs Bob
✅ Contract deployed
🔐 Alice submitting move (encrypted)...
🔐 Bob submitting move (encrypted)...
🔓 Requesting game result...
🎉 GAME RESULT: Player 1 wins
🏆 Winner: Alice
```

**Solo mode demo:**

```bash
npm run demo:solo
```

## Project Structure

```
fhevm-hardhat-template/
├── contracts/
│   ├── RockPaperScissorsBase.sol    # Abstract base with FHE game logic
│   ├── RockPaperScissors.sol        # 2-player mode
│   └── RockPaperScissorsSolo.sol    # Solo mode (vs encrypted AI)
├── test/
│   ├── RockPaperScissors.ts         # Comprehensive test suite
│   ├── RockPaperScissors.demo.ts    # Interactive 2-player demo
│   ├── RockPaperScissorsSolo.ts     # Solo mode tests
│   └── RockPaperScissorsSolo.demo.ts # Interactive solo demo
├── scripts/
│   ├── playGame.ts                  # Standalone 2-player demo
│   └── playSolo.ts                  # Standalone solo demo
├── DOCUMENTATION.md                 # Developer integration guide
└── DESIGN.md                        # Technical decisions & debugging
```

## Features

✅ **Fully encrypted gameplay** - Player moves never revealed on-chain. \
✅ **2-player mode** - Classic Rock-Paper-Scissors with encrypted moves. \
✅ **Solo mode** - Play against Zama (FHE randomness). \
✅ **Modular architecture** - Reusable base contract for FHE games. \
✅ **Comprehensive tests** - 14 passing tests covering happypath + edge cases. \
✅ **Production patterns** - Idempotency, request integrity, ACL management.

## How It Works

```
┌─────────┐         ┌──────────────┐         ┌─────────┐
│ Alice   │────────▶│   Contract   │◀────────│   Bob   │
│ (Rock)  │ encrypt │  (FHE ops)   │ encrypt │ (Paper) │
└─────────┘         └──────┬───────┘         └─────────┘
                           │
                    Calculate winner
                    (on encrypted data)
                           │
                           ▼
                    ┌─────────────┐
                    │ KMS/Gateway │
                    │ (Decryption)│
                    └──────┬──────┘
                           │
                    🎉 Winner: Bob
```

## Run Deployment

### Local Network

```bash
# Terminal 1: Start local FHEVM node
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat deploy --network localhost
```

## Documentation

- **[DOCUMENTATION.md](./DOCUMENTATION.md)** - Quickstart guide for integrating RPS contracts in your dApp
- **[DESIGN.md](./DESIGN.md)** - System design, debugging strategies, and technical trade-offs
- **[Zama FHEVM Docs](https://docs.zama.ai/protocol)** - Official FHEVM documentation

## Test Coverage

```bash
# Run unit tests
npm test
```

**12 unit tests covering:**

- ✅ Draw scenarios
- ✅ Idempotency (prevent double submission)
- ✅ Input validation (sanitize invalid moves)
- ✅ Game reset and replay
- ✅ Solo mode (player vs encrypted AI)
- ✅ Access control

**2 interactive demos:**

- ✅ 2-player demo (`npm run demo:duo`)
- ✅ Solo mode demo (`npm run demo:solo`)

## License

MIT

## Support

- **FHEVM Docs**: https://docs.zama.ai/protocol
- **Zama Discord**: https://discord.gg/zama
- **GitHub Issues**: https://github.com/zama-ai/fhevm/issues

---
