/**
 * Pure-JS MD4 (RFC 1320). Needed for MS-CHAPv2's NT-Password-Hash, which
 * Node's OpenSSL 3 default provider no longer exposes as a built-in digest.
 */

function leftRotate(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0;
}

const S1 = [3, 7, 11, 19];
const S2 = [3, 5, 9, 13];
const S3 = [3, 9, 11, 15];

const ROUND2_ORDER = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
const ROUND3_ORDER = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];

export function md4(message: Buffer): Buffer {
  const msgLenBits = BigInt(message.length) * BigInt(8);

  // Pad: 0x80, zeros until length % 64 === 56, then 8-byte little-endian bit length.
  let padLen = (56 - ((message.length + 1) % 64) + 64) % 64;
  const padded = Buffer.concat([
    message,
    Buffer.from([0x80]),
    Buffer.alloc(padLen),
    Buffer.alloc(8),
  ]);
  padded.writeBigUInt64LE(msgLenBits, padded.length - 8);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const x: number[] = [];
    for (let i = 0; i < 16; i++) {
      x.push(padded.readUInt32LE(offset + i * 4));
    }

    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    // Round 1: F(x,y,z) = (x&y)|(~x&z)
    for (let i = 0; i < 16; i++) {
      const f = (b & c) | (~b & d);
      const s = S1[i % 4];
      const temp = a;
      a = d;
      d = c;
      c = b;
      b = leftRotate((temp + f + x[i]) >>> 0, s);
    }

    // Round 2: G(x,y,z) = (x&y)|(x&z)|(y&z)
    for (let i = 0; i < 16; i++) {
      const k = ROUND2_ORDER[i];
      const g = (b & c) | (b & d) | (c & d);
      const s = S2[i % 4];
      const temp = a;
      a = d;
      d = c;
      c = b;
      b = leftRotate((temp + g + x[k] + 0x5a827999) >>> 0, s);
    }

    // Round 3: H(x,y,z) = x^y^z
    for (let i = 0; i < 16; i++) {
      const k = ROUND3_ORDER[i];
      const h = b ^ c ^ d;
      const s = S3[i % 4];
      const temp = a;
      a = d;
      d = c;
      c = b;
      b = leftRotate((temp + h + x[k] + 0x6ed9eba1) >>> 0, s);
    }

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const out = Buffer.alloc(16);
  out.writeUInt32LE(a, 0);
  out.writeUInt32LE(b, 4);
  out.writeUInt32LE(c, 8);
  out.writeUInt32LE(d, 12);
  return out;
}
