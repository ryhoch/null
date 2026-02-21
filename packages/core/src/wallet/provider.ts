import { secp256k1 } from "@noble/curves/secp256k1";
import { deriveSharedSecret } from "../crypto/ecdh.js";
import { pubKeyToAddress } from "./address.js";
import type { WalletProvider, NullWallet } from "./types.js";

/**
 * EVM (Ethereum) wallet provider.
 *
 * Identity: secp256k1 keypair. Address: last 20 bytes of keccak256(uncompressed pubkey).
 *
 * This is the default WalletProvider implementation. The interface allows swapping
 * in Solana (ed25519), Bitcoin, or other chains without changing core/messaging or core/p2p.
 */
export const EVMWalletProvider: WalletProvider = {
  async generate(): Promise<NullWallet & { privateKey: Uint8Array }> {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const wallet = EVMWalletProvider.fromPrivateKey(privateKey);
    return { ...wallet, privateKey };
  },

  fromPrivateKey(privKey: Uint8Array): NullWallet {
    const publicKey = secp256k1.getPublicKey(privKey, true); // compressed, 33 bytes
    const address = pubKeyToAddress(publicKey);
    return { address, publicKey };
  },

  async deriveSharedSecret(
    myPrivKey: Uint8Array,
    theirPubKey: Uint8Array
  ): Promise<Uint8Array> {
    return deriveSharedSecret(myPrivKey, theirPubKey);
  },
};
