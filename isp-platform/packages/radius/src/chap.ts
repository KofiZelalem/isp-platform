import { createHash, timingSafeEqual } from "node:crypto";

export type VerifyChapPasswordInput = {
  chapIdentifier: number; // CHAP-Password's leading octet, 0-255
  chapChallenge: Buffer;
  chapResponse: Buffer; // 16-byte MD5 digest (CHAP-Password with the identifier octet stripped)
  password: string;
};

/** Verifies an RFC 2865 CHAP-Password: Ident + MD5(Ident + Password + Challenge). */
export function verifyChapPassword(input: VerifyChapPasswordInput): boolean {
  if (input.chapResponse.length !== 16) return false;

  const hash = createHash("md5");
  hash.update(Buffer.from([input.chapIdentifier & 0xff]));
  hash.update(Buffer.from(input.password, "utf8"));
  hash.update(input.chapChallenge);
  const expected = hash.digest();

  return timingSafeEqual(expected, input.chapResponse);
}
