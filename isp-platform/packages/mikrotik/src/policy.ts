import type { RouterOsClient } from "./client";

export type AddressListEntry = {
  list: string;
  address: string;
  comment?: string;
};

/** Pushes a firewall address-list entry, e.g. to isolate a suspended/expired subscriber. */
export async function addToAddressList(client: RouterOsClient, entry: AddressListEntry): Promise<void> {
  const existing = await client.talk([
    "/ip/firewall/address-list/print",
    `?list=${entry.list}`,
    `?address=${entry.address}`,
  ]);
  if (existing.rows.some((row) => Boolean(row[".id"]))) return;

  const words = [
    "/ip/firewall/address-list/add",
    `=list=${entry.list}`,
    `=address=${entry.address}`,
  ];
  if (entry.comment) words.push(`=comment=${entry.comment}`);

  const reply = await client.talk(words);
  if (reply.status === "trap") {
    throw new Error(`RouterOS rejected address-list add: ${reply.attrs.message ?? "unknown error"}`);
  }
}

/** Removes any address-list entries matching list+address, e.g. when reinstating a subscriber. */
export async function removeFromAddressList(
  client: RouterOsClient,
  entry: { list: string; address: string }
): Promise<void> {
  const found = await client.talk([
    "/ip/firewall/address-list/print",
    `?list=${entry.list}`,
    `?address=${entry.address}`,
  ]);

  for (const row of found.rows) {
    if (row[".id"]) {
      await client.talk(["/ip/firewall/address-list/remove", `=.id=${row[".id"]}`]);
    }
  }
}

/** Disconnects a currently-active hotspot session by its bound IP address. */
export async function disconnectHotspotUser(client: RouterOsClient, address: string): Promise<void> {
  const found = await client.talk(["/ip/hotspot/active/print", `?address=${address}`]);

  for (const row of found.rows) {
    if (row[".id"]) {
      await client.talk(["/ip/hotspot/active/remove", `=.id=${row[".id"]}`]);
    }
  }
}

/** Sets (or clears, when kbps is undefined) a simple queue's max-limit for a target IP. */
export async function setSimpleQueueRate(
  client: RouterOsClient,
  params: { name: string; target: string; uploadKbps?: number; downloadKbps?: number }
): Promise<void> {
  const found = await client.talk(["/queue/simple/print", `?name=${params.name}`]);
  const maxLimit = `${(params.uploadKbps ?? 0) * 1000}/${(params.downloadKbps ?? 0) * 1000}`;

  if (found.rows[0]?.[".id"]) {
    await client.talk(["/queue/simple/set", `=.id=${found.rows[0][".id"]}`, `=max-limit=${maxLimit}`]);
  } else {
    await client.talk([
      "/queue/simple/add",
      `=name=${params.name}`,
      `=target=${params.target}`,
      `=max-limit=${maxLimit}`,
    ]);
  }
}
