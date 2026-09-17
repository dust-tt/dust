import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const readFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    default: { ...fs, readFileSync: readFileSyncMock },
    readFileSync: readFileSyncMock,
  };
});

async function getDocApp() {
  return (await import("./doc")).default;
}

describe("GET /api/doc", () => {
  beforeEach(() => {
    vi.resetModules();
    readFileSyncMock.mockReset();
  });

  it("returns the generated Swagger document as JSON", async () => {
    const swagger = {
      openapi: "3.0.0",
      info: { title: "Dust Swagger", version: "0.1.0" },
    };
    readFileSyncMock.mockReturnValue(JSON.stringify(swagger));
    const app = await getDocApp();

    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual(swagger);
    expect(readFileSyncMock).toHaveBeenCalledWith(
      join(process.cwd(), "public", "swagger.json"),
      "utf8"
    );
  });

  it("reuses the generated Swagger document across requests", async () => {
    readFileSyncMock.mockReturnValue('{"openapi":"3.0.0"}');
    const app = await getDocApp();

    const firstResponse = await app.request("/");
    const secondResponse = await app.request("/");

    expect(await firstResponse.json()).toEqual({ openapi: "3.0.0" });
    expect(await secondResponse.json()).toEqual({ openapi: "3.0.0" });
    expect(readFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("returns the standard API error when the Swagger document cannot be read", async () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error("swagger.json is missing");
    });
    const app = await getDocApp();

    const response = await app.request("/");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        type: "internal_server_error",
        message: "Failed to load API documentation.",
      },
    });
  });
});
