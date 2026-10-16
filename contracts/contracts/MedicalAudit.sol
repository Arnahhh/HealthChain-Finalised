// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MedicalAudit
/// @notice Anchors sha256 hashes of medical reports / prescriptions on-chain
///         for tamper-evident audit trails. The contract never stores PHI —
///         only the hash, timestamp, and the address that submitted it.
contract MedicalAudit {
    struct AuditRecord {
        bytes32 dataHash;      // sha256 of the off-chain document
        address submittedBy;   // backend signer address
        uint256 timestamp;
        string recordType;     // "report" | "prescription"
    }

    // recordId (uuid from Postgres, as bytes32) => audit record
    mapping(bytes32 => AuditRecord) public records;

    event RecordAnchored(bytes32 indexed recordId, bytes32 dataHash, string recordType, uint256 timestamp);

    address public owner;
    mapping(address => bool) public authorizedSigners;

    modifier onlyAuthorized() {
        require(authorizedSigners[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedSigners[msg.sender] = true;
    }

    function authorizeSigner(address signer) external {
        require(msg.sender == owner, "Only owner");
        authorizedSigners[signer] = true;
    }

    /// @notice Anchor a new document hash. Reverts if the recordId was
    ///         already anchored (append-only audit trail — no overwrites).
    function anchorRecord(bytes32 recordId, bytes32 dataHash, string calldata recordType) external onlyAuthorized {
        require(records[recordId].timestamp == 0, "Record already anchored");
        records[recordId] = AuditRecord({
            dataHash: dataHash,
            submittedBy: msg.sender,
            timestamp: block.timestamp,
            recordType: recordType
        });
        emit RecordAnchored(recordId, dataHash, recordType, block.timestamp);
    }

    /// @notice Verify a document still matches what was anchored on-chain.
    function verifyRecord(bytes32 recordId, bytes32 dataHash) external view returns (bool) {
        return records[recordId].dataHash == dataHash && records[recordId].timestamp != 0;
    }

    function getRecord(bytes32 recordId) external view returns (AuditRecord memory) {
        return records[recordId];
    }
}
