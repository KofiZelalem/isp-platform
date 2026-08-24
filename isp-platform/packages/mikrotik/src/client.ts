import { Socket } from "node:net";

import { encodeSentence, extractSentences } from "./protocol";

export type RouterOsClientOptions = {
  host: string;
  port: number;
  /** Applies to both the TCP connect and each command round-trip. */
  timeoutMs?: number;
};

export type RouterOsReply = {
  status: "done" | "trap";
  attrs: Record<string, string>;
  rows: Record<string, string>[];
};

function parseAttrWord(word: string): [string, string] | null {
  if (!word.startsWith("=")) return null;
  const body = word.slice(1);
  const separator = body.indexOf("=");
  if (separator < 0) return null;
  return [body.slice(0, separator), body.slice(separator + 1)];
}

/** A minimal RouterOS API client: plain (non-TLS, post-6.43 "plain login") connections only. */
export class RouterOsClient {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;
  private socket: Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private sentenceQueue: string[][] = [];
  private waiters: Array<(sentence: string[]) => void> = [];

  constructor(options: RouterOsClientOptions) {
    this.host = options.host;
    this.port = options.port;
    this.timeoutMs = options.timeoutMs ?? 4000;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Timed out connecting to ${this.host}:${this.port}`));
      }, this.timeoutMs);

      socket.once("connect", () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve();
      });
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.on("data", (chunk) => this.onData(chunk));
      socket.connect(this.port, this.host);
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const { sentences, remaining } = extractSentences(this.buffer);
    this.buffer = remaining;

    for (const sentence of sentences) {
      const waiter = this.waiters.shift();
      if (waiter) waiter(sentence);
      else this.sentenceQueue.push(sentence);
    }
  }

  private readSentence(): Promise<string[]> {
    const queued = this.sentenceQueue.shift();
    if (queued) return Promise.resolve(queued);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== onSentence);
        reject(new Error("Timed out waiting for a RouterOS API response."));
      }, this.timeoutMs);
      const onSentence = (sentence: string[]) => {
        clearTimeout(timer);
        resolve(sentence);
      };
      this.waiters.push(onSentence);
    });
  }

  async login(username: string, password: string): Promise<void> {
    const reply = await this.talk(["/login", `=name=${username}`, `=password=${password}`]);
    if (reply.status !== "done") {
      throw new Error(`RouterOS login failed: ${reply.attrs.message ?? "unknown error"}`);
    }
  }

  async talk(words: string[]): Promise<RouterOsReply> {
    if (!this.socket) throw new Error("RouterOsClient is not connected.");
    this.socket.write(encodeSentence(words));

    const rows: Record<string, string>[] = [];
    while (true) {
      const sentence = await this.readSentence();
      const [control, ...rest] = sentence;
      const attrs: Record<string, string> = {};
      for (const word of rest) {
        const parsed = parseAttrWord(word);
        if (parsed) attrs[parsed[0]] = parsed[1];
      }

      if (control === "!re") {
        rows.push(attrs);
        continue;
      }
      if (control === "!done") return { status: "done", attrs, rows };
      if (control === "!trap") return { status: "trap", attrs, rows };
      if (control === "!fatal") throw new Error(`RouterOS fatal error: ${JSON.stringify(attrs)}`);
      // Unrecognised control word: ignore and keep reading.
    }
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }
}
