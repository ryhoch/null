import { describe, it, expect } from "vitest";
import { importAesKey, encryptAes, decryptAes, hexToBytes, bytesToHex } from "../aes.js";

function randomKey(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

async function makeKey(): Promise<CryptoKey> {
  return importAesKey(randomKey());
}

describe("AES-256-GCM", () => {
  it("roundtrips plaintext correctly", async () => {
    const key = await makeKey();
    const plaintext = "Hello, Null platform!";
    const { iv, ciphertext } = await encryptAes(key, plaintext);
    const decrypted = await decryptAes(key, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("roundtrips an empty string", async () => {
    const key = await makeKey();
    const { iv, ciphertext } = await encryptAes(key, "");
    const decrypted = await decryptAes(key, iv, ciphertext);
    expect(decrypted).toBe("");
  });

  it("roundtrips unicode and emoji", async () => {
    const key = await makeKey();
    const plaintext = "こんにちは 🔐 안녕하세요";
    const { iv, ciphertext } = await encryptAes(key, plaintext);
    const decrypted = await decryptAes(key, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("generates a fresh IV on every call", async () => {
    const key = await makeKey();
    const { iv: iv1 } = await encryptAes(key, "test");
    const { iv: iv2 } = await encryptAes(key, "test");
    expect(iv1).not.toBe(iv2);
  });

  it("produces different ciphertext for the same plaintext due to random IV", async () => {
    const key = await makeKey();
    const { ciphertext: ct1 } = await encryptAes(key, "same");
    const { ciphertext: ct2 } = await encryptAes(key, "same");
    expect(ct1).not.toBe(ct2);
  });

  it("throws when ciphertext is tampered (auth tag failure)", async () => {
    const key = await makeKey();
    const { iv, ciphertext } = await encryptAes(key, "authentic");

    // Flip a bit in the middle of the ciphertext hex
    const midpoint = Math.floor(ciphertext.length / 2);
    const tampered =
      ciphertext.slice(0, midpoint) +
      (ciphertext[midpoint] === "a" ? "b" : "a") +
      ciphertext.slice(midpoint + 1);

    await expect(decryptAes(key, iv, tampered)).rejects.toThrow();
  });

  it("throws when IV is wrong", async () => {
    const key = await makeKey();
    const { ciphertext } = await encryptAes(key, "test");
    const wrongIv = bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(12)));
    await expect(decryptAes(key, wrongIv, ciphertext)).rejects.toThrow();
  });

  it("throws when decrypting with a different key", async () => {
    const key1 = await makeKey();
    const key2 = await makeKey();
    const { iv, ciphertext } = await encryptAes(key1, "secret");
    await expect(decryptAes(key2, iv, ciphertext)).rejects.toThrow();
  });

  it("importAesKey throws for wrong key length", async () => {
    const shortKey = new Uint8Array(16); // AES-128, not 256
    await expect(importAesKey(shortKey)).rejects.toThrow();
  });
});

describe("hex utilities", () => {
  it("bytesToHex produces lowercase hex", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    expect(bytesToHex(bytes)).toBe("00017f80ff");
  });

  it("hexToBytes roundtrips bytesToHex", () => {
    const original = new Uint8Array(32);
    globalThis.crypto.getRandomValues(original);
    expect(hexToBytes(bytesToHex(original))).toEqual(original);
  });

  it("hexToBytes throws on odd-length input", () => {
    expect(() => hexToBytes("abc")).toThrow("odd length");
  });
});
