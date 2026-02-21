import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryAdapter } from "../../storage/memory-adapter.js";
import { OfflineQueue } from "../offline-queue.js";
import { EVMWalletProvider } from "../../wallet/provider.js";
import { encryptMessage } from "../protocol.js";
import {
  QUEUE_MAX_AGE_MS,
  QUEUE_BASE_DELAY_MS,
  QUEUE_MAX_ATTEMPTS,
} from "../types.js";

async function makeMsg(from: Awaited<ReturnType<typeof EVMWalletProvider.generate>>, to: Awaited<ReturnType<typeof EVMWalletProvider.generate>>) {
  return encryptMessage({
    content: "test message",
    fromAddress: from.address,
    toAddress: to.address,
    senderPrivKey: from.privateKey,
    recipientPubKey: to.publicKey,
  });
}

describe("OfflineQueue", () => {
  let storage: MemoryAdapter;
  let queue: OfflineQueue;
  let alice: Awaited<ReturnType<typeof EVMWalletProvider.generate>>;
  let bob: Awaited<ReturnType<typeof EVMWalletProvider.generate>>;

  beforeEach(async () => {
    storage = new MemoryAdapter();
    queue = new OfflineQueue(storage);
    alice = await EVMWalletProvider.generate();
    bob = await EVMWalletProvider.generate();
  });

  it("enqueues and drains a message", async () => {
    const msg = await makeMsg(alice, bob);
    await queue.enqueue(msg);

    const drained = await queue.drainForPeer(bob.address);
    expect(drained).toHaveLength(1);
    expect(drained[0]?.id).toBe(msg.id);
  });

  it("markDelivered removes the message", async () => {
    const msg = await makeMsg(alice, bob);
    await queue.enqueue(msg);
    await queue.markDelivered(bob.address, msg.id);

    const drained = await queue.drainForPeer(bob.address);
    expect(drained).toHaveLength(0);
  });

  it("returns multiple messages sorted oldest-first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const msg1 = await makeMsg(alice, bob);
    await queue.enqueue(msg1);

    vi.setSystemTime(2000);
    const msg2 = await makeMsg(alice, bob);
    await queue.enqueue(msg2);

    vi.setSystemTime(3000);
    const drained = await queue.drainForPeer(bob.address);
    expect(drained[0]?.id).toBe(msg1.id);
    expect(drained[1]?.id).toBe(msg2.id);
    vi.useRealTimers();
  });

  it("markFailed increments attempt count and sets backoff", async () => {
    const msg = await makeMsg(alice, bob);
    await queue.enqueue(msg);

    await queue.markFailed(bob.address, msg.id);

    // Should not appear in drain immediately (it's in backoff)
    const drained = await queue.drainForPeer(bob.address);
    expect(drained).toHaveLength(0);
  });

  it("discards messages past max attempts", async () => {
    vi.useFakeTimers();
    const msg = await makeMsg(alice, bob);
    await queue.enqueue(msg);

    for (let i = 0; i < QUEUE_MAX_ATTEMPTS; i++) {
      // Advance time to pass each backoff period
      vi.advanceTimersByTime(QUEUE_BASE_DELAY_MS * Math.pow(2, i) + 1);
      await queue.markFailed(bob.address, msg.id);
    }

    // Advance way past any backoff
    vi.advanceTimersByTime(1000 * 60 * 60 * 24);
    const drained = await queue.drainForPeer(bob.address);
    expect(drained).toHaveLength(0);
    vi.useRealTimers();
  });

  it("discards expired messages", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const msg = await makeMsg(alice, bob);
    await queue.enqueue(msg);

    // Advance past max age
    vi.setSystemTime(QUEUE_MAX_AGE_MS + 1000);
    const drained = await queue.drainForPeer(bob.address);
    expect(drained).toHaveLength(0);
    vi.useRealTimers();
  });

  it("size() returns total queue count", async () => {
    const msg1 = await makeMsg(alice, bob);
    const msg2 = await makeMsg(alice, bob);
    await queue.enqueue(msg1);
    await queue.enqueue(msg2);
    expect(await queue.size()).toBe(2);
  });

  it("does not drain messages for a different recipient", async () => {
    const charlie = await EVMWalletProvider.generate();
    const msg = await makeMsg(alice, bob);
    await queue.enqueue(msg);

    const drained = await queue.drainForPeer(charlie.address);
    expect(drained).toHaveLength(0);
  });

  it("stored payload contains encrypted content, not plaintext", async () => {
    const msg = await makeMsg(alice, bob);
    await queue.enqueue(msg);

    const drained = await queue.drainForPeer(bob.address);
    const entry = drained[0];
    if (!entry) throw new Error("No entry");

    const payload = JSON.parse(entry.encryptedPayload) as { ciphertext: string; content?: string };
    // Should have ciphertext, not a 'content' field
    expect(payload.ciphertext).toBeDefined();
    expect((payload as Record<string, unknown>)["content"]).toBeUndefined();
  });
});
