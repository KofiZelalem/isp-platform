import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlatformHealth } from "@/lib/api/platform-administration";

export function HealthPanel({ health }: { health: PlatformHealth }) {
  const variant = health.database === "UP" && health.agents.offline === 0 ? "default" : "destructive";
  return <Card><CardHeader><CardTitle>System health</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-muted-foreground">Database</p><Badge variant={health.database === "UP" ? "default" : "destructive"}>{health.database}</Badge></div><div><p className="text-xs text-muted-foreground">Agents</p><p className="font-medium"><Badge variant={variant}>{health.agents.healthy} healthy</Badge> <Badge variant="secondary">{health.agents.degraded} degraded</Badge> <Badge variant="destructive">{health.agents.offline} offline</Badge></p></div><div><p className="text-xs text-muted-foreground">Supabase</p><Badge variant={health.configured.supabase ? "default" : "destructive"}>{health.configured.supabase ? "Configured" : "Missing"}</Badge></div><div><p className="text-xs text-muted-foreground">Worker secret</p><Badge variant={health.configured.workerSecret ? "default" : "destructive"}>{health.configured.workerSecret ? "Configured" : "Missing"}</Badge></div></CardContent></Card>;
}
