# null — Architecture

## System Overview

```mermaid
graph TD
    A[Client A<br/>Electron or Web] -- "1. Register + sign nonce" --> S[Signaling Server<br/>Railway WSS]
    B[Client B<br/>Electron or Web] -- "1. Register + sign nonce" --> S
    A -- "2. Offer/Answer/ICE via signaling" --> S
    S -- "2. Relay SDP + ICE to peer" --> B
    A -- "3. WebRTC DataChannel<br/>AES-256-GCM ciphertext" --> B
    B -- "3. WebRTC DataChannel<br/>AES-256-GCM ciphertext" --> A
```

**Phase 1 — Registration:** Each client connects to the signaling server via WebSocket. The server issues a random nonce; the client signs it with their secp256k1 private key and sends the signature. The server verifies the signature against the claimed Ethereum address and adds the client to the in-memory registry.

**Phase 2 — WebRTC Handshake:** When Client A wants to message Client B, it sends an SDP offer through the signaling server. The server looks up Client B's WebSocket and forwards the offer. ICE candidates are similarly relayed. The signaling server sees only address strings, SDP blobs, and ICE candidates — never message content.

**Phase 3 — Direct P2P:** Once the WebRTC handshake completes, an `RTCDataChannel` opens directly between the two peers (or via a TURN relay if direct fails). All subsequent messages are encrypted payloads — the signaling server is no longer involved.

---

## Encryption Flow

```mermaid
sequenceDiagram
    participant A as Alice (sender)
    participant B as Bob (recipient)

    Note over A: compose plaintext "hello"
    A->>A: ECDH(Alice.priv, Bob.pub) → 32-byte shared secret
    A->>A: HKDF-SHA256(secret, "null-msg-v1") → AES key
    A->>A: AES-256-GCM(plaintext, key, randomIV) → {iv, ciphertext, tag}
    A->>A: Wrap: { v:1, senderPubkeyHex, msg: EncryptedMessage }
    A->>B: send over RTCDataChannel
    B->>B: ECDH(Bob.priv, Alice.pub) → same shared secret
    B->>B: HKDF-SHA256(secret, "null-msg-v1") → AES key
    B->>B: AES-256-GCM.decrypt(ciphertext, key, iv) → plaintext
    Note over B: render "hello"
```

### Key Derivation Details

- **Curve:** secp256k1 (same as Ethereum)
- **ECDH output:** 32-byte shared point x-coordinate
- **KDF:** HKDF-SHA256 with info string `"null-msg-v1"`, no salt
- **Cipher:** AES-256-GCM with 96-bit random IV per message
- **Authentication:** GCM tag provides integrity; tampered messages throw on decrypt and are silently dropped
- **Libraries:** `@noble/curves/secp256k1`, `@noble/hashes/hkdf`, WebCrypto AES-GCM

---

## Message Lifecycle

```mermaid
flowchart TD
    A[User types message] --> B[encryptMessage called]
    B --> C{Peer online?}
    C -- Yes --> D[sendTo via DataChannel]
    D --> E[status: delivered]
    C -- No --> F[Save to offline queue<br/>LevelDB / IndexedDB]
    F --> G[connectToPeer called]
    G --> H{Peer comes online}
    H --> I[drainQueueForPeer]
    I --> D
    D --> J[Recipient decrypts]
    J --> K[Render in ConversationPage]
    K --> L[Read receipt sent back]
    L --> M[Sender sees ✓✓]
```

### Offline Queue

- Queue entries stored under `queue:{peerAddress}:{messageId}` in LevelDB/IndexedDB
- On peer reconnect, `drainQueueForPeer` reads all entries and retries
- **Max age:** 7 days — entries older than this are discarded
- **Max attempts:** 10 — messages that fail 10 times are marked failed
- **Status indicators:** ○ queued · ✓ delivered · ✓✓ read · ✗ failed

---

## WebRTC Connection Establishment

```mermaid
sequenceDiagram
    participant A as Client A (initiator)
    participant S as Signaling Server
    participant B as Client B (responder)

    A->>S: register(address, signature)
    B->>S: register(address, signature)
    A->>A: createDataChannel("null-msg")
    A->>A: createOffer()
    A->>S: { type:"offer", from:A, to:B, payload:SDP }
    S->>B: forward offer
    B->>B: setRemoteDescription(offer)
    B->>B: createAnswer()
    B->>S: { type:"answer", from:B, to:A, payload:SDP }
    S->>A: forward answer
    A->>A: setRemoteDescription(answer)
    loop ICE trickle
        A->>S: { type:"ice-candidate", ... }
        S->>B: forward
        B->>S: { type:"ice-candidate", ... }
        S->>A: forward
    end
    Note over A,B: RTCDataChannel "null-msg" opens
    A-->>B: encrypted messages (no server involvement)
```

---

## Group Chat Key Distribution

```mermaid
sequenceDiagram
    participant Admin
    participant S as Signaling Server
    participant M1 as Member 1
    participant M2 as Member 2

    Admin->>Admin: generate random AES-256 groupKey
    Admin->>Admin: encrypt groupKey for M1: ECDH(Admin.priv, M1.pub) → wrap(groupKey)
    Admin->>Admin: encrypt groupKey for M2: ECDH(Admin.priv, M2.pub) → wrap(groupKey)
    Admin->>M1: { type:"group-key", encryptedKey, groupId, groupName, memberAddresses }
    Admin->>M2: { type:"group-key", encryptedKey, groupId, groupName, memberAddresses }
    M1->>M1: decrypt groupKey with ECDH(M1.priv, Admin.pub)
    M2->>M2: decrypt groupKey with ECDH(M2.priv, Admin.pub)
    Note over M1,M2: All members now share groupKey
    M1->>M2: { type:"group-msg", ciphertext:AES-GCM(msg, groupKey) }
```

**Group key properties:**
- Random 256-bit AES key, never transmitted in plaintext
- Individually wrapped for each member using ECDH + AES-GCM
- If a member is removed, the admin generates a new group key and redistributes
- Group key is stored in LevelDB/IndexedDB (as part of the `Group` record)

---

## Platform Abstraction

The entire React application communicates with the OS/browser exclusively through `window.nullBridge`:

```typescript
interface NullBridge {
  platform: string;          // "darwin" | "win32" | "linux" | "web"
  signalingUrl: string;      // WebSocket URL
  storage: {                 // Key-value store
    get(key): Promise<string | null>
    put(key, value): Promise<void>
    del(key): Promise<void>
    list(prefix): Promise<{key, value}[]>
  }
  system: {                  // OS utilities
    copyToClipboard(text): Promise<void>
    saveFile(name, bytes): Promise<string>
    openFileDialog(filters): Promise<string | null>
    writeIdentity(address, pubkeyHex): Promise<void>
    launchNova(): Promise<void>
  }
  onProtocolLink(cb): void   // null:// deep links (Electron only)
}
```

| Implementation | Backend | Where |
|---|---|---|
| **Electron** | `contextBridge` in preload.ts → IPC to main.ts → LevelDB | `packages/desktop/electron/` |
| **Web** | IndexedDB + Web Clipboard API + `<a download>` | `packages/web/src/web-bridge.ts` |

Because the React components never import Electron or Node APIs directly, the same component tree renders in both environments without modification.

---

## Storage Key Schema

All keys are stored in LevelDB (Electron) or IndexedDB (web) with the following namespace convention:

| Prefix | Contents |
|---|---|
| `keystore` | Encrypted secp256k1 keystore (JSON) |
| `wallet:pubkey` | Compressed public key hex |
| `contact:{address}` | `Contact` JSON |
| `msg:{peerAddr}:{paddedTs}:{msgId}` | `LocalMessage` JSON (sorted by timestamp) |
| `file:{peerAddr}:{transferId}` | File bytes (base64) |
| `gmsg:{groupId}:{paddedTs}:{msgId}` | Group `LocalMessage` JSON |
| `group:{groupId}` | `Group` JSON (includes groupKeyHex) |
| `conv-meta:{address}` | `{ disappearAfterMs }` |
| `group-meta:{groupId}` | `{ disappearAfterMs }` |
| `queue:{peerAddr}:{msgId}` | Offline queue `QueueEntry` JSON |
| `identity:address` | Own address (for Nova cross-app linking) |
| `identity:pubkey` | Own public key (for Nova cross-app linking) |
