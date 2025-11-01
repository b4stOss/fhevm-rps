// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, externalEuint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Rock Paper Scissors with Fully Homomorphic Encryption
/// @notice A confidential Rock-Paper-Scissors game where moves remain encrypted until reveal
/// @dev Uses FHE to compute the winner without revealing individual player moves
contract RockPaperScissors is SepoliaConfig {
    // ============================================
    // State Variables
    // ============================================

    /// @notice Game participants
    address public player1;
    address public player2;

    /// @notice Encrypted moves (0=Rock, 1=Paper, 2=Scissors)
    euint8 private move1;
    euint8 private move2;

    /// @notice Track submission status
    bool public player1Submitted;
    bool public player2Submitted;

    /// @notice Async decryption state (prevents concurrent reveal requests)
    bool public isDecryptionPending;
    uint256 private latestRequestId;

    /// @notice Public result after decryption (0=Draw, 1=Player1 wins, 2=Player2 wins)
    uint8 public result;
    bool public gameRevealed;

    // ============================================
    // Events
    // ============================================

    event GameStarted(address indexed player1, address indexed player2);
    event MoveSubmitted(address indexed player);
    event RevealRequested(uint256 requestId);
    event GameResult(uint8 result, address winner);

    // ============================================
    // External Functions
    // ============================================

    /// @notice Initialize a new game between two players
    /// @param _player2 Address of the second player
    function startGame(address _player2) external {
        require(_player2 != address(0), "Invalid player2 address");
        require(_player2 != msg.sender, "Cannot play against yourself");
        require(player1 == address(0), "Game already in progress");

        player1 = msg.sender;
        player2 = _player2;

        emit GameStarted(player1, player2);
    }

    /// @notice Submit an encrypted move for the current game
    /// @param encryptedMove The encrypted move (external format)
    /// @param inputProof Zero-knowledge proof for the encrypted input
    /// @dev Move must be 0 (Rock), 1 (Paper), or 2 (Scissors)
    /// @dev Invalid moves (> 2) are clamped to 0 (Rock) to prevent game manipulation
    function submitMove(externalEuint8 encryptedMove, bytes calldata inputProof) external {
        require(player1 != address(0), "No active game");
        require(msg.sender == player1 || msg.sender == player2, "Not a player in this game");
        require(!gameRevealed, "Game already revealed");

        // Prevent double submission
        if (msg.sender == player1) {
            require(!player1Submitted, "Player1 already submitted");
        } else {
            require(!player2Submitted, "Player2 already submitted");
        }

        // Convert external encrypted input to internal euint8
        euint8 move = FHE.fromExternal(encryptedMove, inputProof);

        // INPUT VALIDATION: Ensure move is in valid range [0, 2]
        // Without revealing the actual move value (no revert on encrypted condition)
        euint8 MAX_VALID_MOVE = FHE.asEuint8(2);
        ebool isValidMove = FHE.le(move, MAX_VALID_MOVE); // move <= 2

        // If invalid, clamp to 0 (Rock) as default fallback
        // This prevents game manipulation while maintaining confidentiality
        euint8 sanitizedMove = FHE.select(isValidMove, move, FHE.asEuint8(0));

        // Contract needs permission to use this ciphertext for computations
        FHE.allowThis(sanitizedMove);

        // Store the sanitized move
        if (msg.sender == player1) {
            move1 = sanitizedMove;
            player1Submitted = true;
        } else {
            move2 = sanitizedMove;
            player2Submitted = true;
        }

        emit MoveSubmitted(msg.sender);
    }

    /// @notice Request revelation of the game result
    /// @dev Computes the winner using FHE operations and requests async decryption
    function requestReveal() external {
        require(player1 != address(0), "No active game");
        require(player1Submitted && player2Submitted, "Both players must submit moves first");
        require(!isDecryptionPending, "Decryption already in progress");
        require(!gameRevealed, "Game already revealed");

        // Compute encrypted result using FHE
        euint8 encryptedResult = calculateWinner();

        // Grant contract permission to decrypt this result
        FHE.allowThis(encryptedResult);

        // Prepare ciphertext for decryption
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedResult);

        // Request async decryption from KMS
        latestRequestId = FHE.requestDecryption(cts, this.revealCallback.selector, 0);
        isDecryptionPending = true;

        emit RevealRequested(latestRequestId);
    }

    /// @notice Callback function called by the decryption oracle
    /// @param requestId The request ID from requestDecryption
    /// @param cleartexts ABI-encoded decrypted values
    /// @param decryptionProof KMS signatures and proof data
    /// @dev CRITICAL: Always verify signatures to prevent manipulation
    function revealCallback(uint256 requestId, bytes memory cleartexts, bytes memory decryptionProof) public {
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

        // Determine winner address for event
        address winner = address(0);
        if (result == 1) {
            winner = player1;
        } else if (result == 2) {
            winner = player2;
        }

        emit GameResult(result, winner);
    }

    /// @notice Reset the game state for a new round
    /// @dev Only players from the previous game can reset
    /// @dev Encrypted moves (move1, move2) will be overwritten in the next game
    function resetGame() external {
        require(gameRevealed, "Current game not revealed yet");
        require(msg.sender == player1 || msg.sender == player2, "Only players can reset");

        player1 = address(0);
        player2 = address(0);
        player1Submitted = false;
        player2Submitted = false;
        gameRevealed = false;
        result = 0;
        isDecryptionPending = false;
    }

    // ============================================
    // Internal Functions
    // ============================================

    /// @notice Calculate the winner using FHE operations on encrypted moves
    /// @return encryptedResult The encrypted result (0=Draw, 1=P1 wins, 2=P2 wins)
    /// @dev Uses FHE.select() for conditional logic without revealing moves
    function calculateWinner() internal returns (euint8) {
        // Check for draw
        ebool isDraw = FHE.eq(move1, move2);

        // Define encrypted constants for moves
        euint8 ROCK = FHE.asEuint8(0);
        euint8 PAPER = FHE.asEuint8(1);
        euint8 SCISSORS = FHE.asEuint8(2);

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
}
