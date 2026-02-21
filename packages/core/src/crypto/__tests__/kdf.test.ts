import { describe, it, expect } from "vitest";
import { generateSalt, derivePasscodeKey } from "../kdf.js";

describe("generateSalt", () => {
  it("returns 32 bytes", () => {
    expect(generateSalt()).toHaveLength(32);
  });

  it("generates different values each time", () => {
    const s1 = generateSalt();
    const s2 = generateSalt();
    expect(s1).not.toEqual(s2);
  });
});

describe("derivePasscodeKey", () => {
  it("returns 32 bytes", () => {
    const salt = generateSalt();
    const key = derivePasscodeKey("mypasscode", salt);
    expect(key).toHaveLength(32);
  });

  it("is deterministic — same passcode + salt → same key", () => {
    const salt = generateSalt();
    const k1 = derivePasscodeKey("password123", salt);
    const k2 = derivePasscodeKey("password123", salt);
    expect(k1).toEqual(k2);
  });

  it("different passcodes produce different keys", () => {
    const salt = generateSalt();
    const k1 = derivePasscodeKey("correct", salt);
    const k2 = derivePasscodeKey("incorrect", salt);
    expect(k1).not.toEqual(k2);
  });

  it("different salts produce different keys for the same passcode", () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const k1 = derivePasscodeKey("same", salt1);
    const k2 = derivePasscodeKey("same", salt2);
    expect(k1).not.toEqual(k2);
  });

  it("handles empty passcode without throwing", () => {
    const salt = generateSalt();
    expect(() => derivePasscodeKey("", salt)).not.toThrow();
  });

  it("handles unicode passcodes", () => {
    const salt = generateSalt();
    const k1 = derivePasscodeKey("pässwörđ🔑", salt);
    const k2 = derivePasscodeKey("pässwörđ🔑", salt);
    expect(k1).toEqual(k2);
  });
}, 30_000); // PBKDF2 at 600K iterations is intentionally slow
