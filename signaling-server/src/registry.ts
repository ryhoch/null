import type { WebSocket } from "ws";

/**
 * In-memory registry: Ethereum address → active WebSocket.
 *
 * This is the ONLY state the signaling server maintains.
 * No message content, no conversation history, no identity metadata.
 *
 * When a process restarts, all registrations are lost. Clients must re-register
 * on reconnect. This is intentional — stateless design is easier to scale
 * and reduces the attack surface.
 */
export class Registry {
  private readonly map = new Map<string, WebSocket>();

  register(address: string, socket: WebSocket): void {
    // Close stale socket if the address re-registers (e.g., page reload)
    const existing = this.map.get(address);
    if (existing !== undefined && existing !== socket) {
      existing.terminate();
    }
    this.map.set(address, socket);
  }

  getSocket(address: string): WebSocket | undefined {
    return this.map.get(address);
  }

  remove(address: string): void {
    this.map.delete(address);
  }

  removeBySocket(socket: WebSocket): void {
    for (const [addr, ws] of this.map) {
      if (ws === socket) {
        this.map.delete(addr);
        return;
      }
    }
  }

  size(): number {
    return this.map.size;
  }
}
