import { generateSalt, derivePasscodeKey, PBKDF2_ITERATIONS } from "../crypto/kdf.js";
import { importAesKey, encryptAes, decryptAes, bytesToHex, hexToBytes } from "../crypto/aes.js";
import type { KeyStore } from "./types.js";

/**
 * Encrypt a private key with a user passcode and return a serializable KeyStore.
 *
 * The private key is encrypted as AES-256-GCM(PBKDF2(passcode, salt), privkeyHex).
 * The GCM authentication tag implicitly verifies the passcode on decryption:
 * a wrong passcode → wrong derived key → GCM tag mismatch → decrypt throws.
 * No separate MAC or passcode hash is stored.
 *
 * SECURITY: The caller must zero the privateKey buffer after calling seal():
 *   privateKey.fill(0)
 * This function does not zero it internally because the caller may still need it.
 */
export async function seal(
  privateKey: Uint8Array,
  passcode: string,
  address: string
): Promise<KeyStore> {
  const salt = generateSalt();
  const rawKey = derivePasscodeKey(passcode, salt);
  const cryptoKey = await importAesKey(rawKey);

  const privHex = bytesToHex(privateKey);
  const { iv, ciphertext } = await encryptAes(cryptoKey, privHex);

  return {
    version: 1,
    address,
    pbkdf2: {
      salt: bytesToHex(salt),
      iterations: PBKDF2_ITERATIONS,
      algorithm: "sha256",
    },
    aesGcm: { iv, ciphertext },
  };
}

/**
 * Decrypt a KeyStore with the user's passcode and return the raw private key.
 *
 * Throws if:
 *   - The passcode is wrong (AES-GCM authentication tag fails)
 *   - The keystore is malformed or has an unsupported version
 *
 * SECURITY: The returned Uint8Array contains the raw private key in memory.
 * Zero it immediately after use: result.fill(0)
 */
export async function unseal(
  keystore: KeyStore,
  passcode: string
): Promise<Uint8Array> {
  if (keystore.version !== 1) {
    throw new Error(`Unsupported keystore version: ${keystore.version}`);
  }

  const saltBytes = hexToBytes(keystore.pbkdf2.salt);
  const rawKey = derivePasscodeKey(passcode, saltBytes);
  const cryptoKey = await importAesKey(rawKey);

  // Will throw DOMException("OperationError") if passcode is wrong
  const privHex = await decryptAes(
    cryptoKey,
    keystore.aesGcm.iv,
    keystore.aesGcm.ciphertext
  );

  return hexToBytes(privHex);
}
