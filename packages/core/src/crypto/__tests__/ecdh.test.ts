import { describe, it, expect } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import { deriveSharedSecret, isValidPrivateKey } from "../ecdh.js";

function randomPrivKey(): Uint8Array {
  return secp256k1.utils.randomPrivateKey();
}

describe("deriveSharedSecret", () => {
  it("produces the same secret from both sides of ECDH", () => {
    const alicePriv = randomPrivKey();
    const bobPriv = randomPrivKey();
    const alicePub = secp256k1.getPublicKey(alicePriv, true);
    const bobPub = secp256k1.getPublicKey(bobPriv, true);

    const aliceSide = deriveSharedSecret(alicePriv, bobPub);
    const bobSide = deriveSharedSecret(bobPriv, alicePub);

    expect(aliceSide).toEqual(bobSide);
  });

  it("returns 32 bytes", () => {
    const privA = randomPrivKey();
    const privB = randomPrivKey();
    const pubB = secp256k1.getPublicKey(privB, true);

    const secret = deriveSharedSecret(privA, pubB);
    expect(secret).toHaveLength(32);
  });

  it("different key pairs produce different secrets", () => {
    const alicePriv = randomPrivKey();
    const bobPriv = randomPrivKey();
    const charliePriv = randomPrivKey();
    const bobPub = secp256k1.getPublicKey(bobPriv, true);
    const charliePub = secp256k1.getPublicKey(charliePriv, true);

    const secretAB = deriveSharedSecret(alicePriv, bobPub);
    const secretAC = deriveSharedSecret(alicePriv, charliePub);

    expect(secretAB).not.toEqual(secretAC);
  });

  it("is deterministic — same inputs produce same output", () => {
    const alicePriv = randomPrivKey();
    const bobPriv = randomPrivKey();
    const bobPub = secp256k1.getPublicKey(bobPriv, true);

    const first = deriveSharedSecret(alicePriv, bobPub);
    const second = deriveSharedSecret(alicePriv, bobPub);

    expect(first).toEqual(second);
  });
});

describe("isValidPrivateKey", () => {
  it("returns true for a valid private key", () => {
    const key = randomPrivKey();
    expect(isValidPrivateKey(key)).toBe(true);
  });

  it("returns false for an all-zero key", () => {
    const zeroes = new Uint8Array(32);
    expect(isValidPrivateKey(zeroes)).toBe(false);
  });

  it("returns false for a key equal to the curve order (n)", () => {
    // secp256k1 order n — not a valid private key
    const n = Uint8Array.from([
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe,
      0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b,
      0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41,
    ]);
    expect(isValidPrivateKey(n)).toBe(false);
  });
});
