import { describe, expect, it, vi } from "vitest";

import type { RouterOsClient } from "./client";
import { setSimpleQueueRate } from "./policy";

describe("RouterOS rate policy", () => {
  it("creates one deterministic queue and updates it on repeat application", async () => {
    const talk = vi.fn()
      .mockResolvedValueOnce({ status: "done", attrs: {}, rows: [] })
      .mockResolvedValueOnce({ status: "done", attrs: {}, rows: [] })
      .mockResolvedValueOnce({ status: "done", attrs: {}, rows: [{ ".id": "*1" }] })
      .mockResolvedValueOnce({ status: "done", attrs: {}, rows: [] });
    const client = { talk } as unknown as RouterOsClient;

    await setSimpleQueueRate(client, { name: "subscriber-sub-a", target: "10.0.0.20", uploadKbps: 512, downloadKbps: 2048 });
    await setSimpleQueueRate(client, { name: "subscriber-sub-a", target: "10.0.0.20", uploadKbps: 512, downloadKbps: 2048 });

    expect(talk).toHaveBeenNthCalledWith(2, [
      "/queue/simple/add",
      "=name=subscriber-sub-a",
      "=target=10.0.0.20",
      "=max-limit=512000/2048000",
    ]);
    expect(talk).toHaveBeenNthCalledWith(4, [
      "/queue/simple/set",
      "=.id=*1",
      "=max-limit=512000/2048000",
    ]);
  });
});
