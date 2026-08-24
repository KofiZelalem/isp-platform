import { NextResponse } from "next/server";

import { recordAgentHeartbeat } from "@/lib/api/agent-heartbeats";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-agent-signature") ?? undefined;

  try {
    const result = await recordAgentHeartbeat(body, signature);
    return NextResponse.json({ status: "accepted", nodeId: result.nodeId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Heartbeat rejected.";
    const unauthorized = message.includes("signature") || message.includes("authorized") || message.includes("ownership");
    return NextResponse.json({ error: message }, { status: unauthorized ? 401 : 400 });
  }
}
