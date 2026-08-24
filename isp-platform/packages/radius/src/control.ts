import { createSocket, type Socket } from "node:dgram"
import { randomInt } from "node:crypto"

import {
  buildControlPacket,
  parseRadiusAttributes,
  parseRadiusResponse,
  verifyRadiusResponseAuthenticator,
  type RadiusAttribute,
} from "./protocol"

export type RadiusControlClientOptions = {
  host: string
  port?: number
  secret: string
  timeoutMs?: number
}

export type RadiusControlResult = {
  code: number
  identifier: number
  acknowledged: boolean
  replyMessage?: string
  replyAttributes: RadiusAttribute[]
}

/** Sends RFC 5176 CoA and Disconnect-Message packets to a FreeRADIUS/NAS endpoint. */
export class RadiusControlClient {
  private readonly port: number
  private readonly timeoutMs: number

  constructor(private readonly options: RadiusControlClientOptions) {
    this.port = options.port ?? 3799
    this.timeoutMs = options.timeoutMs ?? 4000
  }

  sendCoA(attributes: RadiusAttribute[]): Promise<RadiusControlResult> {
    return this.send(40, attributes)
  }

  sendDisconnect(attributes: RadiusAttribute[]): Promise<RadiusControlResult> {
    return this.send(43, attributes)
  }

  private send(requestCode: 40 | 43, attributes: RadiusAttribute[]): Promise<RadiusControlResult> {
    const identifier = randomInt(0, 256)
    const packet = buildControlPacket(requestCode, identifier, attributes, this.options.secret)
    const requestAuthenticator = packet.subarray(4, 20)
    const expectedAckCode = requestCode === 40 ? 41 : 44
    const expectedNakCode = requestCode === 40 ? 42 : 45

    return new Promise((resolve, reject) => {
      const socket: Socket = createSocket("udp4")
      const timer = setTimeout(() => {
        socket.close()
        reject(new Error("Timed out waiting for RADIUS control response."))
      }, this.timeoutMs)
      socket.once("error", (error) => {
        clearTimeout(timer)
        socket.close()
        reject(error)
      })
      socket.once("message", (message) => {
        clearTimeout(timer)
        socket.close()
        const response = parseRadiusResponse(message)
        if (response.identifier !== identifier || (response.code !== expectedAckCode && response.code !== expectedNakCode)) {
          reject(new Error("RADIUS control response did not match the request."))
          return
        }
        if (!verifyRadiusResponseAuthenticator(message, requestAuthenticator, this.options.secret)) {
          reject(new Error("RADIUS control response authenticator verification failed."))
          return
        }

        const parsedAttributes = parseRadiusAttributes(response.attributes)
        const replyMessage = parsedAttributes
          .find((attribute) => attribute.type === 18)
          ?.value.toString("utf8")
          .trim()

        resolve({
          code: response.code,
          identifier: response.identifier,
          acknowledged: response.code === expectedAckCode,
          replyMessage: replyMessage || undefined,
          replyAttributes: parsedAttributes.map((attribute) => ({
            type: attribute.type,
            value: Buffer.from(attribute.value),
          })),
        })
      })
      socket.send(packet, this.port, this.options.host, (error) => {
        if (error) {
          clearTimeout(timer)
          socket.close()
          reject(error)
        }
      })
    })
  }
}