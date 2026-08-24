/**
 * RouterOS API wire protocol (word length-prefix encoding + sentence framing).
 * See: https://wiki.mikrotik.com/wiki/Manual:API — the format is stable
 * across RouterOS versions, unlike the (now-legacy) MD5 challenge login.
 */

export function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);

  if (length < 0x4000) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(length | 0x8000);
    return buf;
  }

  if (length < 0x200000) {
    const buf = Buffer.alloc(3);
    buf[0] = ((length >> 16) & 0xff) | 0xc0;
    buf[1] = (length >> 8) & 0xff;
    buf[2] = length & 0xff;
    return buf;
  }

  if (length < 0x10000000) {
    const buf = Buffer.alloc(4);
    buf[0] = ((length >> 24) & 0xff) | 0xe0;
    buf[1] = (length >> 16) & 0xff;
    buf[2] = (length >> 8) & 0xff;
    buf[3] = length & 0xff;
    return buf;
  }

  const buf = Buffer.alloc(5);
  buf[0] = 0xf0;
  buf.writeUInt32BE(length, 1);
  return buf;
}

export function encodeWord(word: string): Buffer {
  const data = Buffer.from(word, "utf8");
  return Buffer.concat([encodeLength(data.length), data]);
}

/** A sentence is one or more words followed by a zero-length terminator word. */
export function encodeSentence(words: string[]): Buffer {
  return Buffer.concat([...words.map(encodeWord), Buffer.from([0])]);
}

function decodeLength(buf: Buffer, offset: number): { length: number; bytesUsed: number } | null {
  if (offset >= buf.length) return null;
  const b0 = buf[offset];

  if (b0 < 0x80) return { length: b0, bytesUsed: 1 };

  if ((b0 & 0xc0) === 0x80) {
    if (offset + 1 >= buf.length) return null;
    return { length: ((b0 & 0x3f) << 8) | buf[offset + 1], bytesUsed: 2 };
  }

  if ((b0 & 0xe0) === 0xc0) {
    if (offset + 2 >= buf.length) return null;
    return {
      length: ((b0 & 0x1f) << 16) | (buf[offset + 1] << 8) | buf[offset + 2],
      bytesUsed: 3,
    };
  }

  if ((b0 & 0xf0) === 0xe0) {
    if (offset + 3 >= buf.length) return null;
    return {
      length: ((b0 & 0x0f) << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3],
      bytesUsed: 4,
    };
  }

  if (offset + 4 >= buf.length) return null;
  return { length: buf.readUInt32BE(offset + 1), bytesUsed: 5 };
}

/** Extracts as many complete sentences as are available, returning unconsumed bytes for the next chunk. */
export function extractSentences(buf: Buffer): { sentences: string[][]; remaining: Buffer } {
  const sentences: string[][] = [];
  let cursor = 0;
  let sentenceStart = 0;
  let words: string[] = [];

  while (true) {
    const decoded = decodeLength(buf, cursor);
    if (!decoded) break;

    const wordStart = cursor + decoded.bytesUsed;
    if (wordStart + decoded.length > buf.length) break;

    if (decoded.length === 0) {
      sentences.push(words);
      words = [];
      cursor = wordStart;
      sentenceStart = cursor;
      continue;
    }

    words.push(buf.subarray(wordStart, wordStart + decoded.length).toString("utf8"));
    cursor = wordStart + decoded.length;
  }

  // Bytes belonging to an in-progress (not yet terminated) sentence must be
  // replayed in full next time, since `words` accumulated here is discarded.
  return { sentences, remaining: buf.subarray(sentenceStart) };
}
