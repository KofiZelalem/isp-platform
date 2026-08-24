import { describe, expect, it } from "vitest";

import { buildPortalForwardUrl } from "./forward";

describe("buildPortalForwardUrl", () => {
  it("forwards only allowlisted query keys to /portal", () => {
    const url = buildPortalForwardUrl(
      {
        organization: "org-a",
        destination: "/portal/connected",
        nasNode: "node-a",
        "link-orig": "http://192.168.88.1/status",
        "link-login-only": "http://192.168.88.1/login",
        "chap-id": "10",
        "chap-challenge": "0a0b",
        mac: "AA:BB:CC:DD:EE:FF",
        ip: "192.0.2.8",
        ignore: "x",
      },
      "https://web.isp.test"
    );

    expect(url).toBe(
      "https://web.isp.test/portal?organization=org-a&destination=%2Fportal%2Fconnected&nasNode=node-a&link-orig=http%3A%2F%2F192.168.88.1%2Fstatus&link-login-only=http%3A%2F%2F192.168.88.1%2Flogin&chap-id=10&chap-challenge=0a0b&mac=AA%3ABB%3ACC%3ADD%3AEE%3AFF&ip=192.0.2.8"
    );
  });

  it("falls back to localhost origin when configured origin is invalid", () => {
    const url = buildPortalForwardUrl({ organization: "org-a" }, "javascript:alert(1)");
    expect(url).toBe("http://localhost:3000/portal?organization=org-a");
  });
});
