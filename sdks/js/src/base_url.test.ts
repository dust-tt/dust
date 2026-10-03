import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DustAPI } from "./index";

let closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  const toClose = closers;
  closers = [];
  await Promise.all(toClose.map((close) => close()));
});

async function listen(): Promise<{ port: number; urls: string[] }> {
  const urls: string[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    urls.push(req.url ?? "");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ tokens: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(
    () => new Promise<void>((resolve) => server.close(() => resolve()))
  );
  return { port: (server.address() as AddressInfo).port, urls };
}

const logger = { error: vi.fn(), info: vi.fn(), trace: vi.fn(), warn: vi.fn() };

describe("DustAPI base URL", () => {
  it.each([
    "",
    "/",
    "//",
  ])("does not produce a double slash when baseUrl ends with %j", async (suffix) => {
    const server = await listen();
    const api = new DustAPI({
      baseUrl: `http://127.0.0.1:${server.port}${suffix}`,
      workspaceId: "ws",
      apiKey: "key",
      logger,
    });

    const res = await api.tokenize("hello", "ds-1");

    expect(res.isOk()).toBe(true);
    expect(server.urls).toEqual(["/api/v1/w/ws/data_sources/ds-1/tokenize"]);
  });
});
