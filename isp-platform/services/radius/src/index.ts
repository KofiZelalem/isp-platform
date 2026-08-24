import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const JSON_HEADERS = { "content-type": "application/json" } as const;

export type RadiusProxyRequest =
  | {
      kind: "authorize";
      webBaseUrl: string;
      apiKey: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "accounting";
      webBaseUrl: string;
      apiKey: string;
      payload: Record<string, unknown>;
    };

export function buildWebRadiusUrl(webBaseUrl: string): { authorize: string; accounting: string } {
  const base = webBaseUrl.replace(/\/+$/, "");
  return {
    authorize: `${base}/api/radius/authorize`,
    accounting: `${base}/api/radius/accounting`,
  };
}

export async function proxyRadiusRequest(request: RadiusProxyRequest): Promise<Record<string, unknown>> {
  const url = buildWebRadiusUrl(request.webBaseUrl)[request.kind === "authorize" ? "authorize" : "accounting"];
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": request.apiKey,
    },
    body: JSON.stringify(request.payload),
    signal: AbortSignal.timeout(30_000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === "string" || typeof body?.reason === "string"
      ? (body.error ?? body.reason)
      : `Radius proxy returned ${response.status}.`;
    throw new Error(message);
  }
  return body as Record<string, unknown>;
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_048_576) reject(new Error("Request body is too large."));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, status: number, payload: Record<string, unknown>): void {
  response.statusCode = status;
  response.setHeader("content-type", JSON_HEADERS["content-type"]);
  response.end(JSON.stringify(payload));
}

export async function startRadiusService(port = Number(process.env.RADIUS_PORT ?? 1812)) {
  const bindHost = process.env.RADIUS_BIND_HOST ?? "0.0.0.0";
  const webBaseUrl = process.env.RADIUS_WEB_BASE_URL ?? process.env.APP_ORIGIN ?? "http://web:3000";
  const apiKey = process.env.RADIUS_API_KEY ?? process.env.ISP_OS_WORKER_SECRET ?? "development-radius-key";

  if (!webBaseUrl || !apiKey) {
    throw new Error("RADIUS_WEB_BASE_URL and RADIUS_API_KEY must be configured for the service runtime.");
  }

  const server = createServer(async (request, response) => {
    try {
      if (!request.url || !request.method) {
        writeJson(response, 400, { error: "Malformed request." });
        return;
      }

      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true, service: "radius" });
        return;
      }

      if (request.method !== "POST") {
        writeJson(response, 405, { error: "Only POST is supported." });
        return;
      }

      const bodyText = await readRequestBody(request);
      const payload = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {};
      const kind = url.pathname === "/authorize" ? "authorize" : url.pathname === "/accounting" ? "accounting" : null;

      if (!kind) {
        writeJson(response, 404, { error: "Not found." });
        return;
      }

      const result = await proxyRadiusRequest({ kind, webBaseUrl, apiKey, payload });
      writeJson(response, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Radius request failed.";
      writeJson(response, 400, { error: message });
    }
  });

  return new Promise<ReturnType<typeof server.listen>>((resolve) => {
    server.listen(port, bindHost, () => {
      console.log(`radius service listening on ${bindHost}:${port}`);
      resolve(server);
    });
  });
}

if (process.env.NODE_ENV !== "test") {
  void startRadiusService().catch((error) => {
    console.error("radius service failed to start:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
