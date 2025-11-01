// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, externalEuint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {RockPaperScissorsBase} from "./RockPaperScissorsBase.sol";

/// @title Rock Paper Scissors with Fully Homomorphic Encryption (2-Player Mode)
/// @notice A confidential Rock-Paper-Scissors game where moves remain encrypted until reveal
/// @dev Uses FHE to compute the winner without revealing individual player moves
contract RockPaperScissors is RockPaperScissorsBase {
    // ============================================
    // State Variables (2-Player Specific)
    // ============================================

    /// @notice Game participants
    address public player1;
    address public player2;

    /// @notice Track submission status
    bool public player1Submitted;
    bool public player2Submitted;

    // ============================================
    // Events (2-Player Specific)
    // ============================================

    event GameStarted(address indexed player1, address indexed player2);
    event MoveSubmitted(address indexed player);

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

        // Sanitize move to valid range [0, 2] using base contract logic
        euint8 sanitizedMove = sanitizeMove(move);

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

    /// @notice Get the winner's address based on the result
    /// @param _result The game result (0=Draw, 1=P1 wins, 2=P2 wins)
    /// @return winner The address of the winner (address(0) for draw)
    function getWinnerAddress(uint8 _result) internal view override returns (address) {
        if (_result == 1) {
            return player1;
        } else if (_result == 2) {
            return player2;
        }
        return address(0); // Draw
    }

    /// @notice Reset the game state for a new round
    /// @dev Only players from the previous game can reset
    /// @dev Encrypted moves (move1, move2) will be overwritten in the next game
    function resetGame() external override {
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
}
