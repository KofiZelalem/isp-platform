import { createHash } from "node:crypto"

export type RadiusAttribute = {
  type: number
  value: string | Buffer
}

export type RadiusPacket = {
  code: number
  identifier: number
  authenticator: Buffer
  attributes: Buffer
}

export type ParsedRadiusAttribute = {
  type: number
  value: Buffer
}

export class RadiusProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RadiusProtocolError"
  }
}

export function encodeRadiusAttributes(attributes: RadiusAttribute[]): Buffer {
  const chunks = attributes.map((attribute) => {
    if (!Number.isInteger(attribute.type) || attribute.type < 1 || attribute.type > 255) {
      throw new RadiusProtocolError("RADIUS attribute type must be between 1 and 255.")
    }
    const value = Buffer.isBuffer(attribute.value) ? attribute.value : Buffer.from(attribute.value, "utf8")
    if (value.length > 253) throw new RadiusProtocolError("RADIUS attribute value cannot exceed 253 bytes.")
    return Buffer.concat([Buffer.from([attribute.type, value.length + 2]), value])
  })
  return Buffer.concat(chunks)
}

export function encodeRadiusPacket(packet: RadiusPacket, secret: string): Buffer {
  if (!Number.isInteger(packet.code) || packet.code < 1 || packet.code > 255) {
    throw new RadiusProtocolError("RADIUS packet code must be between 1 and 255.")
  }
  if (!Number.isInteger(packet.identifier) || packet.identifier < 0 || packet.identifier > 255) {
    throw new RadiusProtocolError("RADIUS identifier must be between 0 and 255.")
  }
  if (packet.authenticator.length !== 16) throw new RadiusProtocolError("RADIUS authenticator must be 16 bytes.")
  const length = 20 + packet.attributes.length
  if (length > 4096) throw new RadiusProtocolError("RADIUS packet cannot exceed 4096 bytes.")
  const output = Buffer.alloc(length)
  output[0] = packet.code
  output[1] = packet.identifier
  output.writeUInt16BE(length, 2)
  packet.authenticator.copy(output, 4)
  packet.attributes.copy(output, 20)
  return output
}

export function parseRadiusAttributes(attributes: Buffer): ParsedRadiusAttribute[] {
  const parsed: ParsedRadiusAttribute[] = []
  let offset = 0
  while (offset < attributes.length) {
    if (offset + 2 > attributes.length) {
      throw new RadiusProtocolError("RADIUS attribute header is truncated.")
    }
    const type = attributes[offset]
    const length = attributes[offset + 1]
    if (length < 2) {
      throw new RadiusProtocolError("RADIUS attribute length must be at least 2 bytes.")
    }
    const end = offset + length
    if (end > attributes.length) {
      throw new RadiusProtocolError("RADIUS attribute extends beyond packet length.")
    }
    parsed.push({ type, value: attributes.subarray(offset + 2, end) })
    offset = end
  }
  return parsed
}

export function buildControlPacket(
  code: 40 | 43,
  identifier: number,
  attributes: RadiusAttribute[],
  secret: string
): Buffer {
  const encodedAttributes = encodeRadiusAttributes(attributes)
  // RFC 5176: CoA/Disconnect requests are signed from a zeroed authenticator.
  const authenticator = Buffer.alloc(16)
  const packet = encodeRadiusPacket({ code, identifier, authenticator, attributes: encodedAttributes }, secret)
  const digest = createHash("md5").update(packet).update(secret, "utf8").digest()
  digest.copy(packet, 4)
  return packet
}

export function parseRadiusResponse(packet: Buffer): { code: number; identifier: number; authenticator: Buffer; attributes: Buffer } {
  if (packet.length < 20) throw new RadiusProtocolError("RADIUS response is shorter than the 20-byte header.")
  const length = packet.readUInt16BE(2)
  if (length !== packet.length || length < 20) throw new RadiusProtocolError("RADIUS response length is invalid.")
  return {
    code: packet[0],
    identifier: packet[1],
    authenticator: packet.subarray(4, 20),
    attributes: packet.subarray(20),
  }
}

export function verifyRadiusResponseAuthenticator(
  responsePacket: Buffer,
  requestAuthenticator: Buffer,
  secret: string
): boolean {
  if (requestAuthenticator.length !== 16) {
    throw new RadiusProtocolError("RADIUS request authenticator must be 16 bytes.")
  }
  if (responsePacket.length < 20) {
    throw new RadiusProtocolError("RADIUS response is shorter than the 20-byte header.")
  }

  const packetForDigest = Buffer.from(responsePacket)
  requestAuthenticator.copy(packetForDigest, 4)
  const expected = createHash("md5").update(packetForDigest).update(secret, "utf8").digest()
  const actual = responsePacket.subarray(4, 20)

  return actual.equals(expected)
}
