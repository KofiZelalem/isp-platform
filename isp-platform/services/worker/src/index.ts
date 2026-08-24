const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 30_000);

export type WorkerJobResult = {
  job: "scheduled-reports" | "operational-alerts";
  ok: boolean;
  response?: unknown;
  error?: string;
};

function configuration(): { controlUrl: string; secret: string } {
  const controlUrl = process.env.WORKER_CONTROL_URL;
  const secret = process.env.ISP_OS_WORKER_SECRET;
  if (!controlUrl || !secret || secret.length < 32) {
    throw new Error("WORKER_CONTROL_URL and a 32-character ISP_OS_WORKER_SECRET are required.");
  }
  return { controlUrl: new URL(controlUrl).toString().replace(/\/$/, ""), secret };
}

export async function runWorkerJob(job: WorkerJobResult["job"]): Promise<WorkerJobResult> {
  try {
    const { controlUrl, secret } = configuration();
    const endpoint = job === "scheduled-reports"
      ? "/api/internal/scheduled-reports/run"
      : "/api/internal/operational-alerts/run";
    const response = await fetch(`${controlUrl}${endpoint}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`Control endpoint returned ${response.status}.`);
    return { job, ok: true, response: body };
  } catch (error) {
    return { job, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runWorkerCycle(): Promise<WorkerJobResult[]> {
  return Promise.all([runWorkerJob("scheduled-reports"), runWorkerJob("operational-alerts")]);
}

export function startWorker(): NodeJS.Timeout {
  const run = async () => {
    const results = await runWorkerCycle();
    for (const result of results) {
      if (!result.ok) console.error(`[worker] ${result.job} failed: ${result.error}`);
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  return timer;
}

if (process.env.NODE_ENV !== "test") startWorker();
