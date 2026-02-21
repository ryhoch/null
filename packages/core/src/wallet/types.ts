export interface NullWallet {
  /** Ethereum checksummed address (0x...) */
  address: string;
  /** 33-byte compressed secp256k1 public key */
  publicKey: Uint8Array;
}

export interface KeyStore {
  version: 1;
  address: string;
  pbkdf2: {
    /** Hex-encoded 32-byte salt */
    salt: string;
    iterations: number;
    algorithm: "sha256";
  };
  aesGcm: {
    /** Hex-encoded 12-byte IV */
    iv: string;
    /** Hex-encoded AES-256-GCM ciphertext of the private key (includes GCM auth tag) */
    ciphertext: string;
  };
}

/**
 * Chain-agnostic wallet provider interface.
 *
 * The EVM implementation uses secp256k1 + Ethereum address derivation.
 * Future implementations (Solana ed25519, etc.) implement this same interface
 * so core/messaging and core/p2p never need to know which chain is active.
 */
export interface WalletProvider {
  /** Generate a new random wallet. Private key is returned once for immediate sealing. */
  generate(): Promise<NullWallet & { privateKey: Uint8Array }>;
  /** Reconstruct a NullWallet from an existing private key (no private key in result). */
  fromPrivateKey(privKey: Uint8Array): NullWallet;
  /**
   * Derive a 32-byte ECDH shared secret.
   * Result is identical regardless of which party calls it.
   */
  deriveSharedSecret(
    myPrivKey: Uint8Array,
    theirPubKey: Uint8Array
  ): Promise<Uint8Array>;
}
