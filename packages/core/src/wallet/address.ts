import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "../crypto/aes.js";

/**
 * Derive an EIP-55 checksummed Ethereum address from a compressed public key.
 *
 * Algorithm (EIP-55 + standard Ethereum address derivation):
 *   1. Decompress the 33-byte compressed point to 65-byte uncompressed form
 *   2. Drop the 0x04 prefix — take the 64-byte X|Y coordinate blob
 *   3. keccak256(X|Y) → 32-byte hash
 *   4. Take the last 20 bytes → raw address
 *   5. Apply EIP-55 mixed-case checksum
 */
export function pubKeyToAddress(compressedPubKey: Uint8Array): string {
  const point = secp256k1.ProjectivePoint.fromHex(compressedPubKey);
  // 65-byte uncompressed: 0x04 prefix + 32-byte X + 32-byte Y
  const uncompressed = point.toRawBytes(false);

  // Hash the 64-byte X|Y (skip the 0x04 prefix byte)
  const hash = keccak_256(uncompressed.slice(1));

  // Last 20 bytes are the Ethereum address
  const addressBytes = hash.slice(-20);
  const hex = bytesToHex(addressBytes);

  return "0x" + checksumAddress(hex);
}

/**
 * EIP-55 checksum: capitalise hex characters based on nibbles of keccak256(address).
 */
function checksumAddress(hex: string): string {
  // keccak256 of the lowercase hex address string (without 0x)
  const hash = keccak_256(new TextEncoder().encode(hex));

  return hex
    .split("")
    .map((char, i) => {
      if (!/[a-f0-9]/.test(char)) return char;
      // Each byte of hash covers 2 hex chars. High nibble for even index, low for odd.
      const byte = hash[Math.floor(i / 2)];
      if (byte === undefined) return char;
      const nibble = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
      return nibble >= 8 ? char.toUpperCase() : char;
    })
    .join("");
}
