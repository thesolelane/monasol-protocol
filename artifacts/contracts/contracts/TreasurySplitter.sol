// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TreasurySplitter
/// @notice Receives protocol fees (move-in fees, renewal fees) and splits them
///         between the protocol treasury and a liquidity pool in configurable
///         basis-point proportions.
///
/// @dev    Any EVM address can send MON to this contract (receive / fallback).
///         The split is applied on each deposit — no funds are held long-term.
///         Treasury always receives `treasuryBps / 10_000` of each payment;
///         the remainder goes to the pool.
contract TreasurySplitter is Ownable {

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Protocol treasury — receives the treasury share of each fee.
    address public treasury;

    /// @notice Liquidity pool — receives the remainder of each fee.
    address public pool;

    /// @notice Basis points allocated to the treasury (e.g. 7000 = 70%).
    uint256 public treasuryBps;

    // ─── Events ───────────────────────────────────────────────────────────────

    event FeeReceived(address indexed from, uint256 amount);
    event FeeSplit(uint256 toTreasury, uint256 toPool);
    event TreasuryUpdated(address indexed newTreasury);
    event PoolUpdated(address indexed newPool);
    event SplitUpdated(uint256 newTreasuryBps);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param initialOwner  Protocol owner / multisig.
    /// @param _treasury     Treasury wallet address.
    /// @param _pool         Liquidity pool wallet address.
    /// @param _treasuryBps  Basis points to treasury (1–9999; remainder goes to pool).
    constructor(
        address initialOwner,
        address _treasury,
        address _pool,
        uint256 _treasuryBps
    ) Ownable(initialOwner) {
        require(_treasury != address(0), "TreasurySplitter: zero treasury");
        require(_pool     != address(0), "TreasurySplitter: zero pool");
        require(
            _treasuryBps > 0 && _treasuryBps < BPS_DENOMINATOR,
            "TreasurySplitter: bps out of range"
        );
        treasury     = _treasury;
        pool         = _pool;
        treasuryBps  = _treasuryBps;
    }

    // ─── Receive ──────────────────────────────────────────────────────────────

    /// @notice Accept and immediately split any incoming MON.
    receive() external payable {
        _split(msg.value);
    }

    /// @notice Fallback also accepts and splits.
    fallback() external payable {
        _split(msg.value);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Update the treasury wallet address.
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "TreasurySplitter: zero address");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @notice Update the pool wallet address.
    function setPool(address newPool) external onlyOwner {
        require(newPool != address(0), "TreasurySplitter: zero address");
        pool = newPool;
        emit PoolUpdated(newPool);
    }

    /// @notice Update the treasury basis-point share.
    /// @param  newBps  Must be between 1 and 9999 inclusive.
    function setSplit(uint256 newBps) external onlyOwner {
        require(
            newBps > 0 && newBps < BPS_DENOMINATOR,
            "TreasurySplitter: bps out of range"
        );
        treasuryBps = newBps;
        emit SplitUpdated(newBps);
    }

    /// @notice Emergency sweep — forwards any stuck balance to the treasury.
    /// @dev    Should never hold a balance under normal operation.
    function sweep() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "TreasurySplitter: nothing to sweep");
        _sendETH(treasury, bal);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _split(uint256 amount) internal {
        if (amount == 0) return;

        uint256 toTreasury = (amount * treasuryBps) / BPS_DENOMINATOR;
        uint256 toPool     = amount - toTreasury;

        emit FeeReceived(msg.sender, amount);
        emit FeeSplit(toTreasury, toPool);

        if (toTreasury > 0) _sendETH(treasury, toTreasury);
        if (toPool     > 0) _sendETH(pool,     toPool);
    }

    function _sendETH(address to, uint256 amount) internal {
        (bool ok, ) = to.call{ value: amount }("");
        require(ok, "TreasurySplitter: transfer failed");
    }
}
