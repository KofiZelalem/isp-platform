import { createServer } from "node:net"

import { describe, expect, it } from "vitest"

import { RouterOsClient } from "./client"
import { encodeSentence, extractSentences } from "./protocol"

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    resolve(typeof address === "object" && address ? address.port : 0)
  }))
}

describe("RouterOsClient", () => {
  it("connects, logs in, sends a command, and parses a RouterOS reply", async () => {
    const server = createServer((socket) => {
      let buffer = Buffer.alloc(0)
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk])
        const result = extractSentences(buffer)
        buffer = result.remaining
        for (const words of result.sentences) {
          const command = words[0]
          if (command === "/login") {
            socket.write(encodeSentence(["!done"]))
          } else {
            socket.write(Buffer.concat([
              encodeSentence(["!re", "=name=router"]),
              encodeSentence(["!done"]),
            ]))
          }
        }
      })
    })
    const port = await listen(server)
    const client = new RouterOsClient({ host: "127.0.0.1", port, timeoutMs: 1000 })

    try {
      await client.connect()
      await client.login("admin", "secret")
      await expect(client.talk(["/system/identity/print"])).resolves.toEqual({
        status: "done",
        attrs: {},
        rows: [{ name: "router" }],
      })
    } finally {
      client.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
