// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title MetadataRegistry
 * @notice Centralized registry for token metadata CIDs.
 * @dev Mimics Virtuals Protocol "Identity" approach by decoupling metadata from tokens.
 */
contract MetadataRegistry {
    address public owner;
    
    // Mapping from token address to IPFS Metadata CID
    mapping(address => string) private _tokenMetadata;

    event MetadataUpdated(address indexed token, string cid);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Registry: Caller is not the owner");
        _;
    }

    /**
     * @notice Set or update metadata for a token.
     * @param token The address of the ERC-20 token.
     * @param cid The IPFS CID for the metadata JSON.
     */
    function setTokenMetadata(address token, string calldata cid) external onlyOwner {
        require(token != address(0), "Registry: Invalid token address");
        require(bytes(cid).length > 0, "Registry: CID cannot be empty");
        _tokenMetadata[token] = cid;
        emit MetadataUpdated(token, cid);
    }

    /**
     * @notice Get the metadata CID for a token.
     * @param token The address of the ERC-20 token.
     */
    function getTokenMetadata(address token) external view returns (string memory) {
        return _tokenMetadata[token];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Registry: New owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
