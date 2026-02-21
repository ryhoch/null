import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import { createSignalingServer } from "../src/server.js";
import type { AddressInfo } from "net";

// 42 chars each: 0x + 40 hex digits
const ADDR_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ADDR_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

/**
 * Connect a WebSocket client.
 *
 * Returns a `nextMessage()` function that resolves with the next incoming
 * message. Uses a consumer queue so messages that arrive before `nextMessage()`
 * is called are buffered (no race condition).
 */
function connectClient(url: string): Promise<{
  ws: WebSocket;
  nextMessage: () => Promise<unknown>;
  close: () => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const buffered: unknown[] = [];
    const waiters: Array<(v: unknown) => void> = [];

    ws.on("error", reject);

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as unknown;
      const waiter = waiters.shift();
      if (waiter) {
        waiter(msg);
      } else {
        buffered.push(msg);
      }
    });

    ws.on("open", () => {
      resolve({
        ws,
        nextMessage: () => {
          if (buffered.length > 0) return Promise.resolve(buffered.shift()!);
          return new Promise((res) => waiters.push(res));
        },
        close: () => new Promise<void>((res) => {
          ws.once("close", res);
          ws.close();
        }),
      });
    });
  });
}

describe("signaling server", () => {
  let server: ReturnType<typeof createSignalingServer>;
  let url: string;

  beforeEach(async () => {
    server = createSignalingServer();
    await new Promise<void>((resolve) =>
      server.httpServer.listen(0, "127.0.0.1", resolve)
    );
    const { port } = server.httpServer.address() as AddressInfo;
    url = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const ws of server.wss.clients) ws.terminate();
    server.wss.close();
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  });

  it("relays an offer from A to B", async () => {
    // Connect both clients in parallel to avoid sequential open-event race
    const [clientA, clientB] = await Promise.all([
      connectClient(url),
      connectClient(url),
    ]);

    clientA.ws.send(JSON.stringify({ type: "register", from: ADDR_A, payload: null }));
    clientB.ws.send(JSON.stringify({ type: "register", from: ADDR_B, payload: null }));
    await new Promise((r) => setTimeout(r, 50));

    // Set up listener before sending to guarantee no missed messages
    const messagePromise = clientB.nextMessage();
    clientA.ws.send(
      JSON.stringify({ type: "offer", from: ADDR_A, to: ADDR_B, payload: { sdp: "test-sdp" } })
    );

    const received = await messagePromise as { type: string; from: string; payload: { sdp: string } };
    expect(received.type).toBe("offer");
    expect(received.from).toBe(ADDR_A);
    expect(received.payload.sdp).toBe("test-sdp");
  }, 10_000);

  it("sends peer-unavailable when recipient is not registered", async () => {
    const clientA = await connectClient(url);
    clientA.ws.send(JSON.stringify({ type: "register", from: ADDR_A, payload: null }));
    await new Promise((r) => setTimeout(r, 50));

    // Listener before send
    const responsePromise = clientA.nextMessage();
    clientA.ws.send(
      JSON.stringify({ type: "offer", from: ADDR_A, to: ADDR_B, payload: {} })
    );

    const response = await responsePromise as { type: string; payload: { address: string } };
    expect(response.type).toBe("peer-unavailable");
    expect(response.payload.address).toBe(ADDR_B);
  }, 10_000);

  it("relays an ice-candidate from A to B", async () => {
    const [clientA, clientB] = await Promise.all([
      connectClient(url),
      connectClient(url),
    ]);

    clientA.ws.send(JSON.stringify({ type: "register", from: ADDR_A, payload: null }));
    clientB.ws.send(JSON.stringify({ type: "register", from: ADDR_B, payload: null }));
    await new Promise((r) => setTimeout(r, 50));

    const candidate = { candidate: "candidate:1 1 UDP 123 1.2.3.4 5000 typ host" };
    const messagePromise = clientB.nextMessage();
    clientA.ws.send(
      JSON.stringify({ type: "ice-candidate", from: ADDR_A, to: ADDR_B, payload: candidate })
    );

    const received = await messagePromise as { type: string; payload: typeof candidate };
    expect(received.type).toBe("ice-candidate");
    expect(received.payload.candidate).toBe(candidate.candidate);
  }, 10_000);

  it("silently drops messages with invalid address format", async () => {
    const clientA = await connectClient(url);
    let receivedAny = false;
    clientA.ws.on("message", () => { receivedAny = true; });

    clientA.ws.send(
      JSON.stringify({ type: "offer", from: "not-an-address", to: "also-invalid", payload: {} })
    );

    await new Promise((r) => setTimeout(r, 200));
    expect(receivedAny).toBe(false);
  }, 10_000);

  it("updates peer count on register/disconnect", async () => {
    expect(server.registry.size()).toBe(0);

    const clientA = await connectClient(url);
    clientA.ws.send(JSON.stringify({ type: "register", from: ADDR_A, payload: null }));
    await new Promise((r) => setTimeout(r, 50));

    expect(server.registry.size()).toBe(1);

    await clientA.close();
    await new Promise((r) => setTimeout(r, 50));

    expect(server.registry.size()).toBe(0);
  }, 10_000);
});
