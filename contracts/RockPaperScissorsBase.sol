// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, externalEuint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Rock Paper Scissors Base Contract
/// @notice Abstract base contract containing shared game logic for Rock-Paper-Scissors variants
/// @dev Implements common FHE operations, winner calculation, and callback handling
abstract contract RockPaperScissorsBase is SepoliaConfig {
    // ============================================
    // State Variables (Common)
    // ============================================

    /// @notice Encrypted moves (0=Rock, 1=Paper, 2=Scissors)
    euint8 internal move1;
    euint8 internal move2;

    /// @notice Async decryption state
    bool public isDecryptionPending;
    uint256 internal latestRequestId;

    /// @notice Public result after decryption (0=Draw, 1=Player1/You wins, 2=Player2/AI wins)
    uint8 public result;
    bool public gameRevealed;

    // ============================================
    // Events
    // ============================================

    event RevealRequested(uint256 requestId);
    event GameResult(uint8 result, address winner);

    // ============================================
    // Internal Functions (Shared Logic)
    // ============================================

    /// @notice Sanitize move to valid range [0, 2] without revealing the value
    /// @param move The encrypted move to sanitize
    /// @return sanitizedMove The sanitized move (clamped to 0 if invalid)
    /// @dev Uses FHE operations to prevent information leakage
    function sanitizeMove(euint8 move) internal returns (euint8) {
        // Define valid range [0, 2]
        // Using scalar operand for gas efficiency (instead of FHE.asEuint8(2))
        ebool isValidMove = FHE.le(move, 2); // move <= 2

        // If invalid, clamp to 0 (Rock) as fallback
        // This prevents game manipulation while maintaining confidentiality
        euint8 sanitizedMove = FHE.select(isValidMove, move, FHE.asEuint8(0));

        return sanitizedMove;
    }

    /// @notice Calculate the winner using FHE operations on encrypted moves
    /// @return encryptedResult The encrypted result (0=Draw, 1=P1 wins, 2=P2 wins)
    /// @dev Uses FHE.select() for conditional logic without revealing moves
    function calculateWinner() internal returns (euint8) {
        // Check for draw
        ebool isDraw = FHE.eq(move1, move2);

        // Define scalar constants for moves (using scalars for gas efficiency)
        uint8 ROCK = 0;
        uint8 PAPER = 1;
        uint8 SCISSORS = 2;

        // Check all winning conditions for Player 1
        // P1 wins if: (Rock beats Scissors) OR (Paper beats Rock) OR (Scissors beats Paper)

        // Rock beats Scissors
        ebool p1Rock = FHE.eq(move1, ROCK);
        ebool p2Scissors = FHE.eq(move2, SCISSORS);
        ebool p1WinsRockScissors = FHE.and(p1Rock, p2Scissors);

        // Paper beats Rock
        ebool p1Paper = FHE.eq(move1, PAPER);
        ebool p2Rock = FHE.eq(move2, ROCK);
        ebool p1WinsPaperRock = FHE.and(p1Paper, p2Rock);

        // Scissors beats Paper
        ebool p1Scissors = FHE.eq(move1, SCISSORS);
        ebool p2Paper = FHE.eq(move2, PAPER);
        ebool p1WinsScissorsPaper = FHE.and(p1Scissors, p2Paper);

        // Combine all P1 winning conditions
        ebool p1Wins = FHE.or(p1WinsRockScissors, FHE.or(p1WinsPaperRock, p1WinsScissorsPaper));

        // Result encoding: 0=Draw, 1=P1 wins, 2=P2 wins
        // Use nested FHE.select to handle all three cases
        euint8 encryptedResult = FHE.select(
            isDraw,
            FHE.asEuint8(0), // Draw
            FHE.select(
                p1Wins,
                FHE.asEuint8(1), // Player 1 wins
                FHE.asEuint8(2) // Player 2 wins (by elimination)
            )
        );

        return encryptedResult;
    }

    /// @notice Callback function called by the decryption oracle
    /// @param requestId The request ID from requestDecryption
    /// @param cleartexts ABI-encoded decrypted values
    /// @param decryptionProof KMS signatures and proof data
    /// @dev CRITICAL: Always verify signatures to prevent manipulation
    function revealCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) public virtual {
        // Anti-replay: Verify this is the expected request
        require(requestId == latestRequestId, "Invalid request ID");

        // SECURITY: Verify KMS signatures (prevents relayer manipulation)
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        // Decode the decrypted result
        uint8 decryptedResult = abi.decode(cleartexts, (uint8));

        // Store result and update state
        result = decryptedResult;
        gameRevealed = true;
        isDecryptionPending = false;

        // Emit event with winner (determined by child contract)
        address winner = getWinnerAddress(decryptedResult);
        emit GameResult(result, winner);
    }

    // ============================================
    // Abstract Functions (Implemented by children)
    // ============================================

    /// @notice Reset the game state for a new round
    /// @dev Implementation differs between 2-player and solo modes
    function resetGame() external virtual;

    /// @notice Get the winner's address based on the result
    /// @param _result The game result (0=Draw, 1=P1 wins, 2=P2 wins)
    /// @return winner The address of the winner (address(0) for draw)
    /// @dev Implementation differs between 2-player and solo modes
    function getWinnerAddress(uint8 _result) internal view virtual returns (address);
}
