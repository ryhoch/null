import { describe, it, expect } from "vitest";
import { EVMWalletProvider } from "../../wallet/provider.js";
import { encryptMessage, decryptMessage } from "../protocol.js";

async function makePair() {
  const alice = await EVMWalletProvider.generate();
  const bob = await EVMWalletProvider.generate();
  return { alice, bob };
}

describe("encryptMessage / decryptMessage", () => {
  it("roundtrips a simple message", async () => {
    const { alice, bob } = await makePair();
    const plaintext = "Hello Bob!";

    const encrypted = await encryptMessage({
      content: plaintext,
      fromAddress: alice.address,
      toAddress: bob.address,
      senderPrivKey: alice.privateKey,
      recipientPubKey: bob.publicKey,
    });

    const decrypted = await decryptMessage({
      message: encrypted,
      recipientPrivKey: bob.privateKey,
      senderPubKey: alice.publicKey,
    });

    expect(decrypted).toBe(plaintext);
  });

  it("populates message metadata correctly", async () => {
    const { alice, bob } = await makePair();

    const encrypted = await encryptMessage({
      content: "test",
      fromAddress: alice.address,
      toAddress: bob.address,
      senderPrivKey: alice.privateKey,
      recipientPubKey: bob.publicKey,
    });

    expect(encrypted.from).toBe(alice.address);
    expect(encrypted.to).toBe(bob.address);
    expect(encrypted.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(encrypted.timestamp).toBeGreaterThan(0);
    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
  });

  it("throws when decrypting with wrong recipient key", async () => {
    const { alice, bob } = await makePair();
    const charlie = await EVMWalletProvider.generate();

    const encrypted = await encryptMessage({
      content: "for Bob",
      fromAddress: alice.address,
      toAddress: bob.address,
      senderPrivKey: alice.privateKey,
      recipientPubKey: bob.publicKey,
    });

    await expect(
      decryptMessage({
        message: encrypted,
        recipientPrivKey: charlie.privateKey,
        senderPubKey: alice.publicKey,
      })
    ).rejects.toThrow();
  });

  it("handles unicode content", async () => {
    const { alice, bob } = await makePair();
    const content = "안녕하세요 🔐 こんにちは";

    const encrypted = await encryptMessage({
      content,
      fromAddress: alice.address,
      toAddress: bob.address,
      senderPrivKey: alice.privateKey,
      recipientPubKey: bob.publicKey,
    });

    const decrypted = await decryptMessage({
      message: encrypted,
      recipientPrivKey: bob.privateKey,
      senderPubKey: alice.publicKey,
    });

    expect(decrypted).toBe(content);
  });

  it("produces different ciphertexts for the same content (fresh IV)", async () => {
    const { alice, bob } = await makePair();

    const e1 = await encryptMessage({
      content: "same",
      fromAddress: alice.address,
      toAddress: bob.address,
      senderPrivKey: alice.privateKey,
      recipientPubKey: bob.publicKey,
    });

    const e2 = await encryptMessage({
      content: "same",
      fromAddress: alice.address,
      toAddress: bob.address,
      senderPrivKey: alice.privateKey,
      recipientPubKey: bob.publicKey,
    });

    expect(e1.ciphertext).not.toBe(e2.ciphertext);
    expect(e1.id).not.toBe(e2.id);
  });
});
