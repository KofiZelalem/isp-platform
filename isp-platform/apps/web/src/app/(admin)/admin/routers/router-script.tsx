"use client"

import * as React from "react"
import { Check, Copy, FileCode2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export function RouterScript({ script }: { script: string | null }) {
  const [copied, setCopied] = React.useState(false)

  if (!script) {
    return <span className="text-sm text-muted-foreground">Awaiting WireGuard setup</span>
  }

  const setupScript = script

  async function copyScript() {
    await navigator.clipboard.writeText(setupScript)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <details className="group max-w-xl">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-primary">
        <FileCode2 className="h-4 w-4" />
        View setup script
      </summary>
      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-muted/40">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">RouterOS v7 terminal script</span>
          <Button type="button" variant="outline" size="sm" onClick={copyScript}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="max-h-72 overflow-auto p-3 text-xs leading-5 text-foreground">
          <code>{script}</code>
        </pre>
      </div>
    </details>
  )
}
