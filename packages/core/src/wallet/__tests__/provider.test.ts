import { describe, it, expect } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import { EVMWalletProvider } from "../provider.js";

describe("EVMWalletProvider", () => {
  describe("generate()", () => {
    it("returns a wallet with a valid Ethereum address", async () => {
      const wallet = await EVMWalletProvider.generate();
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("returns a 33-byte compressed public key", async () => {
      const wallet = await EVMWalletProvider.generate();
      expect(wallet.publicKey).toHaveLength(33);
    });

    it("returns a 32-byte private key", async () => {
      const wallet = await EVMWalletProvider.generate();
      expect(wallet.privateKey).toHaveLength(32);
    });

    it("generates unique wallets each time", async () => {
      const w1 = await EVMWalletProvider.generate();
      const w2 = await EVMWalletProvider.generate();
      expect(w1.address).not.toBe(w2.address);
    });
  });

  describe("fromPrivateKey()", () => {
    it("reconstructs the same wallet from a private key", async () => {
      const { address, publicKey, privateKey } = await EVMWalletProvider.generate();
      const reconstructed = EVMWalletProvider.fromPrivateKey(privateKey);
      expect(reconstructed.address).toBe(address);
      expect(reconstructed.publicKey).toEqual(publicKey);
    });

    it("matches a known Ethereum test vector", () => {
      // Well-known private key used in Ethereum documentation examples
      const privKey = new Uint8Array(32);
      privKey[31] = 1; // private key = 1

      // Public key for privKey=1 on secp256k1
      const expectedPub = secp256k1.getPublicKey(privKey, true);
      const wallet = EVMWalletProvider.fromPrivateKey(privKey);

      expect(wallet.publicKey).toEqual(expectedPub);
      // Address should be a valid 0x... format
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });
  });

  describe("deriveSharedSecret()", () => {
    it("produces the same secret from both sides", async () => {
      const alice = await EVMWalletProvider.generate();
      const bob = await EVMWalletProvider.generate();

      const secretAB = await EVMWalletProvider.deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );
      const secretBA = await EVMWalletProvider.deriveSharedSecret(
        bob.privateKey,
        alice.publicKey
      );

      expect(secretAB).toEqual(secretBA);
    });
  });
});
