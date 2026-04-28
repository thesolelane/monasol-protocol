// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/IStakeManager.sol";
import "@account-abstraction/contracts/interfaces/INonceManager.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

/**
 * @title MockEntryPoint
 * @notice Minimal EntryPoint stub for local Hardhat testing.
 *         Implements IEntryPoint v0.7 without full bundler logic.
 *         Do NOT deploy to any real network.
 */
contract MockEntryPoint is IEntryPoint {

    mapping(address => uint256) private _deposits;
    mapping(address => mapping(uint192 => uint256)) private _nonces;
    mapping(address => IStakeManager.DepositInfo) private _depositInfo;

    // ── IEntryPoint ───────────────────────────────────────────────────────────

    function handleOps(
        PackedUserOperation[] calldata,
        address payable
    ) external override {}

    function handleAggregatedOps(
        UserOpsPerAggregator[] calldata,
        address payable
    ) external override {}

    function getUserOpHash(
        PackedUserOperation calldata userOp
    ) external view override returns (bytes32) {
        return keccak256(abi.encode(userOp, block.chainid, address(this)));
    }

    function getSenderAddress(bytes memory) external pure override {}

    function delegateAndRevert(address target, bytes calldata data) external override {
        (bool success, bytes memory ret) = target.delegatecall(data);
        revert DelegateAndRevert(success, ret);
    }

    // ── INonceManager ─────────────────────────────────────────────────────────

    function getNonce(
        address sender,
        uint192 key
    ) external view override returns (uint256) {
        return _nonces[sender][key];
    }

    function incrementNonce(uint192 key) external override {
        _nonces[msg.sender][key]++;
    }

    // ── IStakeManager ─────────────────────────────────────────────────────────

    function balanceOf(address account) external view override returns (uint256) {
        return _deposits[account];
    }

    function depositTo(address account) external payable override {
        _deposits[account] += msg.value;
        _depositInfo[account].deposit += uint112(msg.value);
    }

    function withdrawTo(
        address payable withdrawAddress,
        uint256 withdrawAmount
    ) external override {
        require(_deposits[msg.sender] >= withdrawAmount, "Insufficient deposit");
        _deposits[msg.sender] -= withdrawAmount;
        (bool ok,) = withdrawAddress.call{value: withdrawAmount}("");
        require(ok, "Transfer failed");
    }

    function addStake(uint32 unstakeDelaySec) external payable override {
        _depositInfo[msg.sender].stake += uint112(msg.value);
        _depositInfo[msg.sender].unstakeDelaySec = unstakeDelaySec;
    }

    function unlockStake() external override {
        _depositInfo[msg.sender].withdrawTime = uint48(block.timestamp + _depositInfo[msg.sender].unstakeDelaySec);
    }

    function withdrawStake(address payable withdrawAddress) external override {
        uint256 stake = _depositInfo[msg.sender].stake;
        require(stake > 0, "No stake");
        _depositInfo[msg.sender].stake = 0;
        (bool ok,) = withdrawAddress.call{value: stake}("");
        require(ok, "Transfer failed");
    }

    function getDepositInfo(address account)
        external view override
        returns (IStakeManager.DepositInfo memory)
    {
        return _depositInfo[account];
    }
}
