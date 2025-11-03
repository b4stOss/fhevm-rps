// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, externalEuint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {RockPaperScissorsBase} from "./RockPaperScissorsBase.sol";

/// @title Rock Paper Scissors Solo Mode (Player vs Zama)
/// @notice A confidential Rock-Paper-Scissors game where you play against Zama
/// @dev Uses FHE randomness (FHE.randEuint8) for Zama's moves. Zama represents the encrypted randomness system itself.
contract RockPaperScissorsSolo is RockPaperScissorsBase {
    // ============================================
    // State Variables (Solo-Specific)
    // ============================================

    /// @notice The player (human)
    address public player;

    // ============================================
    // Events (Solo-Specific)
    // ============================================

    event GameStarted(address indexed player);

    // ============================================
    // External Functions
    // ============================================

    /// @notice Play a game against Zama (the encrypted random opponent) in a single transaction
    /// @param encryptedMove The player's encrypted move (external format)
    /// @param inputProof Zero-knowledge proof for the encrypted input
    /// @dev This function:
    ///      1. Accepts the player's encrypted move
    ///      2. Generates a random encrypted move for Zama using FHE.randEuint8()
    ///      3. Calculates the winner using FHE operations
    ///      4. Requests async decryption of the result
    /// @dev Zama's move remains encrypted and is never revealed, preserving confidentiality
    /// @dev "Zama" personifies the encrypted randomness system - you play against the FHE PRNG itself
    function playAgainstZama(externalEuint8 encryptedMove, bytes calldata inputProof) external {
        require(player == address(0), "Game already in progress");
        require(!isDecryptionPending, "Decryption already in progress");

        // Set player
        player = msg.sender;

        // 1. Process player move
        euint8 playerMove = FHE.fromExternal(encryptedMove, inputProof);
        move1 = sanitizeMove(playerMove);
        FHE.allowThis(move1);

        // 2. Generate Zama's move using FHE random (0-2 for Rock/Paper/Scissors)
        // IMPORTANT: This generates an encrypted random number, so Zama's move remains confidential
        // Note: randEuint8() without bound generates [0, 255]. Using modulo 3 gives near-uniform distribution
        // Bias is negligible: ~0.39% (256 mod 3 = 1, so value 0 appears 86 times vs 85 for values 1 and 2)
        euint8 randomValue = FHE.randEuint8(); // Generates random value in [0, 255]
        move2 = FHE.rem(randomValue, 3); // Map to [0, 2] - using scalar for gas efficiency
        FHE.allowThis(move2);

        // 3. Calculate winner (all encrypted)
        euint8 encryptedResult = calculateWinner();
        FHE.allowThis(encryptedResult);

        // 4. Request async decryption from KMS
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedResult);
        latestRequestId = FHE.requestDecryption(cts, this.revealCallback.selector, 0);
        isDecryptionPending = true;

        emit GameStarted(player);
        emit RevealRequested(latestRequestId);
    }

    /// @notice Get the winner's address based on the result
    /// @param _result The game result (0=Draw, 1=Player wins, 2=Zama wins)
    /// @return winner The address of the winner (address(0) for draw or Zama wins)
    function getWinnerAddress(uint8 _result) internal view override returns (address) {
        if (_result == 1) {
            return player; // Player wins
        }
        return address(0); // Draw or Zama wins
    }

    /// @notice Reset the game state for a new round
    /// @dev Only the player can reset after the game is revealed
    function resetGame() external override {
        require(gameRevealed, "Current game not revealed yet");
        require(msg.sender == player, "Only player can reset");

        player = address(0);
        gameRevealed = false;
        result = 0;
        isDecryptionPending = false;
    }
}
