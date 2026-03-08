# null Platform Roadmap

## v0.2.5 (current)
- Signaling identity verification: challenge-response (secp256k1) prevents address spoofing
- Passcode minimum raised to 8 characters
- Group sender names: clearer labels, nickname resolution in preview
- Nova integration: "Connected via null" banner in Nova, "Open Nova" in null
- UX polish

## v0.3.0 (next)
- Voice/video calls (infrastructure ready, UI in progress)
- Forward secrecy: Signal-style Double Ratchet for per-message key rotation
  - Currently ECDH shared secret is static — a leaked private key exposes all past messages
  - v0.3.0 will implement X3DH key agreement + Double Ratchet session keys

## Backlog
- Mobile app (skeleton exists: WebRTC shim + secure keystore adapter)
- Message search
- Read receipts
- Typing indicators
- Reactions
- CI/CD pipeline
- Server-side disappear timer enforcement (currently client-side only)

## Known Limitations (v0.2.x)
- No forward secrecy (see v0.3.0)
- Disappear timers are client-side only — a modified client could ignore them
- Signaling server has no rate limiting (DoS mitigation is network-layer)
