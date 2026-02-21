import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignalingClient } from "../signaling-client.js";
import type { SignalingMessage } from "../types.js";

/**
 * Mock WebSocket factory.
 * Returns a WebSocket-like object that stores sent messages and exposes
 * a simulateMessage() helper for triggering onmessage callbacks.
 */
function createMockWS() {
  const sent: string[] = [];
  let onopen: (() => void) | null = null;
  let onmessage: ((e: { data: string }) => void) | null = null;
  let onerror: ((e: Event) => void) | null = null;
  let onclose: (() => void) | null = null;
  let readyState = 0; // CONNECTING

  const ws = {
    get readyState() { return readyState; },
    set onopen(fn: (() => void) | null) { onopen = fn; },
    set onmessage(fn: ((e: { data: string }) => void) | null) { onmessage = fn; },
    set onerror(fn: ((e: Event) => void) | null) { onerror = fn; },
    set onclose(fn: (() => void) | null) { onclose = fn; },
    send(data: string) { sent.push(data); },
    close() { readyState = 3; onclose?.(); },
    // Test helpers
    open() { readyState = 1; onopen?.(); },
    simulateMessage(data: unknown) {
      onmessage?.({ data: JSON.stringify(data) });
    },
    get sentMessages() { return sent; },
  };

  return ws;
}

type MockWS = ReturnType<typeof createMockWS>;

describe("SignalingClient", () => {
  let mockWS: MockWS;
  let WSImpl: new (url: string) => WebSocket;
  let client: SignalingClient;

  beforeEach(() => {
    mockWS = createMockWS();
    WSImpl = vi.fn().mockReturnValue(mockWS) as unknown as new (url: string) => WebSocket;
    client = new SignalingClient("ws://test", "0x1234567890123456789012345678901234567890", WSImpl);
  });

  it("sends a register message on connect", async () => {
    const connectPromise = client.connect();
    mockWS.open();
    await connectPromise;

    expect(mockWS.sentMessages).toHaveLength(1);
    const msg = JSON.parse(mockWS.sentMessages[0]!) as SignalingMessage;
    expect(msg.type).toBe("register");
    expect(msg.from).toBe("0x1234567890123456789012345678901234567890");
  });

  it("calls registered handlers when a message arrives", async () => {
    const connectPromise = client.connect();
    mockWS.open();
    await connectPromise;

    const received: SignalingMessage[] = [];
    client.on("offer", (msg) => received.push(msg));

    mockWS.simulateMessage({
      type: "offer",
      from: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      to: "0x1234567890123456789012345678901234567890",
      payload: { sdp: "..." },
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("offer");
  });

  it("send() serialises the message as JSON", async () => {
    const connectPromise = client.connect();
    mockWS.open();
    await connectPromise;

    const msg: SignalingMessage = {
      type: "answer",
      from: "0x1234567890123456789012345678901234567890",
      to: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      payload: { sdp: "answer-sdp" },
    };
    client.send(msg);

    // [0] is the register message, [1] is the answer
    const sent = JSON.parse(mockWS.sentMessages[1]!) as SignalingMessage;
    expect(sent.type).toBe("answer");
    expect((sent.payload as { sdp: string }).sdp).toBe("answer-sdp");
  });

  it("silently drops malformed incoming messages", async () => {
    const connectPromise = client.connect();
    mockWS.open();
    await connectPromise;

    const received: SignalingMessage[] = [];
    client.on("offer", (msg) => received.push(msg));

    // Trigger onmessage directly with malformed data
    (mockWS as unknown as { onmessage: (e: { data: string }) => void }).onmessage?.(
      { data: "not valid json{{{{" }
    );

    expect(received).toHaveLength(0);
  });

  it("off() removes a handler", async () => {
    const connectPromise = client.connect();
    mockWS.open();
    await connectPromise;

    const received: SignalingMessage[] = [];
    const handler = (msg: SignalingMessage) => received.push(msg);
    client.on("offer", handler);
    client.off("offer", handler);

    mockWS.simulateMessage({ type: "offer", payload: null });
    expect(received).toHaveLength(0);
  });
});
