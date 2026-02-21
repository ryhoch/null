/**
 * End-to-end integration test: two in-process peers exchange encrypted messages.
 *
 * This test does NOT use WebRTC or a real network. Instead, it validates the
 * full crypto + messaging pipeline:
 *
 *   Alice generates wallet
 *   Bob generates wallet
 *   Alice encrypts a message for Bob  ← encryptMessage()
 *   Message is stored in offline queue ← OfflineQueue.enqueue()
 *   "Bob comes online" — queue is drained ← OfflineQueue.drainForPeer()
 *   Bob decrypts the message  ← decryptMessage()
 *   Plaintext matches original content ✓
 */
import { describe, it, expect } from "vitest";
import { EVMWalletProvider } from "../../wallet/provider.js";
import { encryptMessage, decryptMessage } from "../protocol.js";
import { OfflineQueue } from "../offline-queue.js";
import { MemoryAdapter } from "../../storage/memory-adapter.js";
import type { EncryptedMessage } from "../../crypto/types.js";

describe("End-to-end messaging flow", () => {
  it("Alice sends an encrypted message to offline Bob, Bob decrypts on reconnect", async () => {
    // ── Setup ──────────────────────────────────────────────────────────────
    const alice = await EVMWalletProvider.generate();
    const bob = await EVMWalletProvider.generate();

    // Simulated: Bob shares his public key with Alice (e.g., via address book / QR code)
    // In reality this happens out-of-band or via the signaling layer
    const bobPublicKey = bob.publicKey;
    const alicePublicKey = alice.publicKey;

    const storage = new MemoryAdapter();
    const queue = new OfflineQueue(storage);

    // ── Alice sends a message while Bob is offline ─────────────────────────
    const originalContent = "Hey Bob! This message is end-to-end encrypted.";

    const encrypted = await encryptMessage({
      content: originalContent,
      fromAddress: alice.address,
      toAddress: bob.address,
      senderPrivKey: alice.privateKey,
      recipientPubKey: bobPublicKey,
    });

    // Bob is offline — enqueue the encrypted payload
    await queue.enqueue(encrypted);

    // ── Verify queue state ─────────────────────────────────────────────────
    expect(await queue.size()).toBe(1);

    // ── Bob reconnects — drain queue ───────────────────────────────────────
    const pending = await queue.drainForPeer(bob.address);
    expect(pending).toHaveLength(1);

    const entry = pending[0];
    if (!entry) throw new Error("Expected a queued message");

    // ── Bob decrypts the message ───────────────────────────────────────────
    const queuedMessage = JSON.parse(entry.encryptedPayload) as EncryptedMessage;
    const decrypted = await decryptMessage({
      message: queuedMessage,
      recipientPrivKey: bob.privateKey,
      senderPubKey: alicePublicKey,
    });

    expect(decrypted).toBe(originalContent);

    // ── Mark delivered ─────────────────────────────────────────────────────
    await queue.markDelivered(bob.address, entry.id);
    expect(await queue.size()).toBe(0);
  });

  it("Multiple messages from Alice to Bob are all decryptable", async () => {
    const alice = await EVMWalletProvider.generate();
    const bob = await EVMWalletProvider.generate();
    const storage = new MemoryAdapter();
    const queue = new OfflineQueue(storage);

    const messages = [
      "First message",
      "Second message with unicode: こんにちは",
      "Third message with emoji: 🔐🌐",
      '{"nested": "json", "value": 42}',
    ];

    // Enqueue all messages
    for (const content of messages) {
      const encrypted = await encryptMessage({
        content,
        fromAddress: alice.address,
        toAddress: bob.address,
        senderPrivKey: alice.privateKey,
        recipientPubKey: bob.publicKey,
      });
      await queue.enqueue(encrypted);
    }

    expect(await queue.size()).toBe(messages.length);

    // Drain and decrypt all
    const pending = await queue.drainForPeer(bob.address);
    expect(pending).toHaveLength(messages.length);

    const decrypted = await Promise.all(
      pending.map(async (entry) => {
        const msg = JSON.parse(entry.encryptedPayload) as EncryptedMessage;
        return decryptMessage({
          message: msg,
          recipientPrivKey: bob.privateKey,
          senderPubKey: alice.publicKey,
        });
      })
    );

    // Order preserved (sorted by timestamp ascending)
    expect(decrypted).toEqual(messages);
  });

  it("Tampered ciphertext is rejected during decryption", async () => {
    const alice = await EVMWalletProvider.generate();
    const bob = await EVMWalletProvider.generate();

    const encrypted = await encryptMessage({
      content: "sensitive content",
      fromAddress: alice.address,
      toAddress: bob.address,
      senderPrivKey: alice.privateKey,
      recipientPubKey: bob.publicKey,
    });

    // Flip a byte in the ciphertext to simulate tampering
    const tampered: EncryptedMessage = {
      ...encrypted,
      ciphertext:
        encrypted.ciphertext.slice(0, 10) +
        (encrypted.ciphertext[10] === "a" ? "b" : "a") +
        encrypted.ciphertext.slice(11),
    };

    await expect(
      decryptMessage({
        message: tampered,
        recipientPrivKey: bob.privateKey,
        senderPubKey: alice.publicKey,
      })
    ).rejects.toThrow();
  });

  it("Charlie cannot decrypt a message intended for Bob", async () => {
    const alice = await EVMWalletProvider.generate();
    const bob = await EVMWalletProvider.generate();
    const charlie = await EVMWalletProvider.generate();

    const encrypted = await encryptMessage({
      content: "Only for Bob",
      fromAddress: alice.address,
      toAddress: bob.address,
      senderPrivKey: alice.privateKey,
      recipientPubKey: bob.publicKey,
    });

    // Charlie tries to decrypt with his key pair
    await expect(
      decryptMessage({
        message: encrypted,
        recipientPrivKey: charlie.privateKey,
        senderPubKey: alice.publicKey,
      })
    ).rejects.toThrow();
  });
});
