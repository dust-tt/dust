import { frontSequelize } from "@app/lib/resources/storage";
import * as shutdownSignal from "@app/lib/shutdown_signal";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redisPingMock = vi.fn();

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: () => ({ ping: redisPingMock }),
}));

describe("GET /api/healthz", () => {
  it("returns 200 ok", async () => {
    const response = await honoApp.request("/api/healthz");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});

describe("GET /api/healthz/ready", () => {
  beforeEach(() => {
    vi.spyOn(shutdownSignal, "isInShutdown").mockReturnValue(false);
  });

  it("returns 200 with status ready when not shutting down", async () => {
    const response = await honoApp.request("/api/healthz/ready");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ready",
      commitHash: expect.any(String),
    });
  });

  it("returns 503 with status shutting_down when in shutdown", async () => {
    vi.spyOn(shutdownSignal, "isInShutdown").mockReturnValue(true);

    const response = await honoApp.request("/api/healthz/ready");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "shutting_down" });
  });
});

describe("GET /api/healthz/startup", () => {
  beforeEach(() => {
    redisPingMock.mockReset();
    redisPingMock.mockResolvedValue(undefined);
  });

  it("returns 200 when redis and database are healthy", async () => {
    const response = await honoApp.request("/api/healthz/startup");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.dependencies).toEqual([
      expect.objectContaining({ name: "redis", ok: true }),
      expect.objectContaining({ name: "database", ok: true }),
    ]);
  });

  it("returns 503 when redis ping fails", async () => {
    redisPingMock.mockRejectedValue(new Error("redis down"));

    const response = await honoApp.request("/api/healthz/startup");

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("not ready");
    expect(body.dependencies).toEqual([
      expect.objectContaining({
        name: "redis",
        ok: false,
        error: "redis down",
      }),
      expect.objectContaining({ name: "database", ok: true }),
    ]);
  });

  it("returns 503 when database query fails", async () => {
    vi.spyOn(frontSequelize, "query").mockRejectedValueOnce(
      new Error("db down")
    );

    const response = await honoApp.request("/api/healthz/startup");

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("not ready");
    expect(body.dependencies).toEqual([
      expect.objectContaining({ name: "redis", ok: true }),
      expect.objectContaining({
        name: "database",
        ok: false,
        error: "db down",
      }),
    ]);
  });
});
