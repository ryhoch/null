import { v4 as uuidv4 } from "uuid";
import { importAesKey, encryptAes, decryptAes, bytesToHex, hexToBytes } from "../crypto/aes.js";
import { deriveSharedSecret } from "../crypto/ecdh.js";

// ── Group types ───────────────────────────────────────────────────────────────

export interface Group {
  id: string;
  name: string;
  avatar?: string;           // base64 PNG
  adminAddress: string;
  memberAddresses: string[]; // includes admin
  createdAt: number;
  /** AES-256 group key — hex encoded. Each member stores this in their local DB. */
  groupKeyHex: string;
}

// ── Wire message types ────────────────────────────────────────────────────────

/** Encrypted group message — sent to all members */
export interface GroupMessageEnvelope {
  type: "group-msg";
  groupId: string;
  messageId: string;
  fromAddress: string;
  /** AES-GCM ciphertext of the plaintext content, encrypted with groupKey */
  ciphertext: string;
  iv: string;
  timestamp: number;
  /** Optional: time in ms after which this message self-destructs */
  expiresIn?: number;
}

/** Group key distribution — admin sends to each new member individually */
export interface GroupKeyEnvelope {
  type: "group-key";
  groupId: string;
  groupName: string;
  adminAddress: string;
  memberAddresses: string[];
  createdAt: number;
  /** The group AES key encrypted with recipient's ECDH-derived shared secret */
  encryptedKeyIv: string;
  encryptedKeyCiphertext: string;
}

/** Admin-only: add/remove members */
export interface GroupMemberUpdate {
  type: "group-member-update";
  groupId: string;
  adminAddress: string;
  action: "add" | "remove";
  targetAddress: string;
  timestamp: number;
}

/** Member leaving group */
export interface GroupLeave {
  type: "group-leave";
  groupId: string;
  fromAddress: string;
  timestamp: number;
}

export type GroupWireMessage =
  | GroupMessageEnvelope
  | GroupKeyEnvelope
  | GroupMemberUpdate
  | GroupLeave;

// ── Parse helper ──────────────────────────────────────────────────────────────

export function parseGroupWireMessage(raw: string): GroupWireMessage | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const type = obj["type"];
    if (
      type === "group-msg" ||
      type === "group-key" ||
      type === "group-member-update" ||
      type === "group-leave"
    ) {
      return obj as unknown as GroupWireMessage;
    }
  } catch {
    // not a group message
  }
  return null;
}

// ── Group key creation ────────────────────────────────────────────────────────

/** Generate a fresh AES-256 group key (random 32 bytes) */
export function generateGroupKey(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}

/** Create a new group */
export function createGroup(
  name: string,
  adminAddress: string,
  memberAddresses: string[],
  avatar?: string
): Group {
  const allMembers = Array.from(new Set([adminAddress, ...memberAddresses]));
  const group: Group = {
    id: uuidv4(),
    name,
    adminAddress,
    memberAddresses: allMembers,
    createdAt: Date.now(),
    groupKeyHex: generateGroupKey(),
  };
  if (avatar !== undefined) group.avatar = avatar;
  return group;
}

// ── Encrypt group key for a recipient ────────────────────────────────────────

/** Encrypt the group AES key for a specific member using ECDH */
export async function encryptGroupKeyForMember(
  groupKeyHex: string,
  ourPrivKey: Uint8Array,
  theirPubKey: Uint8Array
): Promise<{ encryptedKeyIv: string; encryptedKeyCiphertext: string }> {
  const sharedSecret = deriveSharedSecret(ourPrivKey, theirPubKey);
  const transportKey = await importAesKey(sharedSecret);
  const { iv, ciphertext } = await encryptAes(transportKey, groupKeyHex);
  return { encryptedKeyIv: iv, encryptedKeyCiphertext: ciphertext };
}

/** Decrypt the group AES key received from admin */
export async function decryptGroupKey(
  encryptedKeyIv: string,
  encryptedKeyCiphertext: string,
  ourPrivKey: Uint8Array,
  senderPubKey: Uint8Array
): Promise<string> {
  const sharedSecret = deriveSharedSecret(ourPrivKey, senderPubKey);
  const transportKey = await importAesKey(sharedSecret);
  return decryptAes(transportKey, encryptedKeyIv, encryptedKeyCiphertext);
}

// ── Encrypt / decrypt group messages ─────────────────────────────────────────

export async function encryptGroupMessage(
  plaintext: string,
  groupKeyHex: string
): Promise<{ ciphertext: string; iv: string }> {
  const keyBytes = hexToBytes(groupKeyHex);
  const key = await importAesKey(keyBytes);
  return encryptAes(key, plaintext);
}

export async function decryptGroupMessage(
  ciphertext: string,
  iv: string,
  groupKeyHex: string
): Promise<string> {
  const keyBytes = hexToBytes(groupKeyHex);
  const key = await importAesKey(keyBytes);
  return decryptAes(key, iv, ciphertext);
}
