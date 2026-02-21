import { describe, it, expect } from "vitest";
import { EVMWalletProvider } from "../provider.js";
import { seal, unseal } from "../keystore.js";

describe("keystore seal/unseal", () => {
  it("roundtrips the private key with the correct passcode", async () => {
    const wallet = await EVMWalletProvider.generate();
    const ks = await seal(wallet.privateKey, "correct-passcode", wallet.address);
    const recovered = await unseal(ks, "correct-passcode");
    expect(recovered).toEqual(wallet.privateKey);
  });

  it("throws when the passcode is wrong", async () => {
    const wallet = await EVMWalletProvider.generate();
    const ks = await seal(wallet.privateKey, "correct", wallet.address);
    await expect(unseal(ks, "wrong")).rejects.toThrow();
  });

  it("stores the address in the keystore", async () => {
    const wallet = await EVMWalletProvider.generate();
    const ks = await seal(wallet.privateKey, "pass", wallet.address);
    expect(ks.address).toBe(wallet.address);
  });

  it("produces a different ciphertext each time (fresh salt + IV)", async () => {
    const wallet = await EVMWalletProvider.generate();
    const ks1 = await seal(wallet.privateKey, "pass", wallet.address);
    const ks2 = await seal(wallet.privateKey, "pass", wallet.address);
    expect(ks1.pbkdf2.salt).not.toBe(ks2.pbkdf2.salt);
    expect(ks1.aesGcm.iv).not.toBe(ks2.aesGcm.iv);
    expect(ks1.aesGcm.ciphertext).not.toBe(ks2.aesGcm.ciphertext);
  });

  it("keystore has version 1", async () => {
    const wallet = await EVMWalletProvider.generate();
    const ks = await seal(wallet.privateKey, "pass", wallet.address);
    expect(ks.version).toBe(1);
  });

  it("throws for unsupported keystore version", async () => {
    const wallet = await EVMWalletProvider.generate();
    const ks = await seal(wallet.privateKey, "pass", wallet.address);
    const badVersion = { ...ks, version: 99 } as unknown as typeof ks;
    await expect(unseal(badVersion, "pass")).rejects.toThrow("Unsupported keystore version");
  });

  it("recovered key can reconstruct the same wallet", async () => {
    const original = await EVMWalletProvider.generate();
    const ks = await seal(original.privateKey, "passphrase", original.address);
    const recoveredKey = await unseal(ks, "passphrase");
    const reconstructed = EVMWalletProvider.fromPrivateKey(recoveredKey);
    expect(reconstructed.address).toBe(original.address);
  });
}, 60_000); // PBKDF2 is intentionally slow
