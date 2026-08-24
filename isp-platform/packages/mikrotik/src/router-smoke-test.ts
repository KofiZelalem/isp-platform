import { RouterOsClient } from "./client"

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function main(): Promise<void> {
  const host = required("MIKROTIK_HOST")
  const username = required("MIKROTIK_USERNAME")
  const password = required("MIKROTIK_PASSWORD")
  const port = Number(process.env.MIKROTIK_PORT ?? "8728")
  const timeoutMs = Number(process.env.MIKROTIK_TIMEOUT_MS ?? "4000")

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MIKROTIK_PORT must be an integer between 1 and 65535")
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("MIKROTIK_TIMEOUT_MS must be a positive number")
  }

  const client = new RouterOsClient({ host, port, timeoutMs })
  try {
    process.stdout.write(`Connecting to ${host}:${port}...\n`)
    await client.connect()
    await client.login(username, password)

    const identity = await client.talk(["/system/identity/print"])
    const resource = await client.talk(["/system/resource/print"])

    if (identity.status !== "done" || resource.status !== "done") {
      throw new Error("RouterOS returned a trap while reading system information")
    }

    process.stdout.write(`Connected: ${identity.rows[0]?.name ?? "unnamed router"}\n`)
    process.stdout.write(`Version: ${resource.rows[0]?.version ?? "unknown"}\n`)
    process.stdout.write("RouterOS API smoke test passed.\n")
  } finally {
    client.close()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`RouterOS API smoke test failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})