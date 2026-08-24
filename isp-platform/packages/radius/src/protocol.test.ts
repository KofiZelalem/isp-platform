import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  buildControlPacket,
  encodeRadiusAttributes,
  parseRadiusAttributes,
  verifyRadiusResponseAuthenticator,
} from "./protocol"

describe("RADIUS control protocol", () => {
  it("builds CoA/Disconnect request authenticators from a zeroed authenticator", () => {
    const secret = "shared-secret"
    const packet = buildControlPacket(40, 7, [
      { type: 1, value: "alice" },
      { type: 18, value: "hello" },
    ], secret)

    const digestInput = Buffer.from(packet)
    digestInput.fill(0, 4, 20)
    const expectedAuthenticator = createHash("md5")
      .update(digestInput)
      .update(secret, "utf8")
      .digest()

    expect(packet.subarray(4, 20).equals(expectedAuthenticator)).toBe(true)
  })

  it("verifies a valid response authenticator and rejects tampering", () => {
    const secret = "shared-secret"
    const request = buildControlPacket(43, 9, [{ type: 1, value: "alice" }], secret)
    const requestAuthenticator = request.subarray(4, 20)

    const attributes = encodeRadiusAttributes([{ type: 18, value: "Disconnect acknowledged" }])
    const response = Buffer.alloc(20 + attributes.length)
    response[0] = 44 // Disconnect-ACK
    response[1] = 9
    response.writeUInt16BE(response.length, 2)
    requestAuthenticator.copy(response, 4)
    attributes.copy(response, 20)

    const digest = createHash("md5").update(response).update(secret, "utf8").digest()
    digest.copy(response, 4)

    expect(verifyRadiusResponseAuthenticator(response, requestAuthenticator, secret)).toBe(true)

    const tampered = Buffer.from(response)
    tampered[20] = tampered[20] ^ 0xff
    expect(verifyRadiusResponseAuthenticator(tampered, requestAuthenticator, secret)).toBe(false)
  })

  it("parses encoded attributes and guards malformed lengths", () => {
    const encoded = encodeRadiusAttributes([
      { type: 1, value: "alice" },
      { type: 8, value: Buffer.from([192, 168, 1, 10]) },
    ])

    const parsed = parseRadiusAttributes(encoded)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ type: 1 })
    expect(parsed[0].value.toString("utf8")).toBe("alice")

    expect(() => parseRadiusAttributes(Buffer.from([1]))).toThrow(
      "RADIUS attribute header is truncated."
    )
    expect(() => parseRadiusAttributes(Buffer.from([1, 1]))).toThrow(
      "RADIUS attribute length must be at least 2 bytes."
    )
    expect(() => parseRadiusAttributes(Buffer.from([1, 5, 0]))).toThrow(
      "RADIUS attribute extends beyond packet length."
    )
  })
})
