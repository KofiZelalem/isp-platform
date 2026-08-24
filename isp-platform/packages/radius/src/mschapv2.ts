import { createHash, timingSafeEqual } from "node:crypto";

import { desEncryptBlock } from "./crypto/des";
import { md4 } from "./crypto/md4";

function ntPasswordHash(password: string): Buffer {
  return md4(Buffer.from(password, "utf16le"));
}

function challengeHash(peerChallenge: Buffer, authenticatorChallenge: Buffer, username: string): Buffer {
  const hash = createHash("sha1");
  hash.update(peerChallenge);
  hash.update(authenticatorChallenge);
  hash.update(Buffer.from(username, "utf8"));
  return hash.digest().subarray(0, 8);
}

/** Expands a 7-byte (56-bit) key into an 8-byte DES key; the low bit of each byte is an ignored parity slot. */
function desKeyFromSevenBytes(k: Buffer): Buffer {
  const key = Buffer.alloc(8);
  key[0] = k[0] >> 1;
  key[1] = ((k[0] << 6) | (k[1] >> 2)) & 0xff;
  key[2] = ((k[1] << 5) | (k[2] >> 3)) & 0xff;
  key[3] = ((k[2] << 4) | (k[3] >> 4)) & 0xff;
  key[4] = ((k[3] << 3) | (k[4] >> 5)) & 0xff;
  key[5] = ((k[4] << 2) | (k[5] >> 6)) & 0xff;
  key[6] = ((k[5] << 1) | (k[6] >> 7)) & 0xff;
  key[7] = k[6] & 0x7f;
  for (let i = 0; i < 8; i++) key[i] = (key[i] << 1) & 0xff;
  return key;
}

function challengeResponse(challenge8: Buffer, passwordHash16: Buffer): Buffer {
  const padded = Buffer.concat([passwordHash16, Buffer.alloc(5)]); // 16 -> 21 bytes
  return Buffer.concat([
    desEncryptBlock(desKeyFromSevenBytes(padded.subarray(0, 7)), challenge8),
    desEncryptBlock(desKeyFromSevenBytes(padded.subarray(7, 14)), challenge8),
    desEncryptBlock(desKeyFromSevenBytes(padded.subarray(14, 21)), challenge8),
  ]);
}

export type GenerateNtResponseInput = {
  authenticatorChallenge: Buffer; // 16 bytes, from the RADIUS server
  peerChallenge: Buffer; // 16 bytes, from the client
  username: string;
  password: string;
};

/** Implements the MS-CHAPv2 GenerateNTResponse algorithm (RFC 2759 section 8.1). */
export function generateNtResponse(input: GenerateNtResponseInput): Buffer {
  const chal = challengeHash(input.peerChallenge, input.authenticatorChallenge, input.username);
  const hash = ntPasswordHash(input.password);
  return challengeResponse(chal, hash);
}

export type VerifyMsChapV2Input = GenerateNtResponseInput & {
  ntResponse: Buffer; // 24 bytes, as received from the client
};

export function verifyMsChapV2Response(input: VerifyMsChapV2Input): boolean {
  if (input.ntResponse.length !== 24) return false;
  const expected = generateNtResponse(input);
  return timingSafeEqual(expected, input.ntResponse);
}
