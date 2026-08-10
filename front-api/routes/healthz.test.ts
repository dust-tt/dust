import { frontSequelize } from "@app/lib/resources/storage";
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
  it("returns 200 with status ready", async () => {
    const response = await honoApp.request("/api/healthz/ready");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ready",
      commitHash: expect.any(String),
    });
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
