import {
  DUST_FILE_CONTENT_TYPE_HEADER,
  DUST_FILE_ID_HEADER,
} from "@app/types/files";
import { cors } from "@front-api/middlewares/cors";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

const APP_ORIGIN = "https://app.dust.tt";

function createApp() {
  const app = new Hono();
  app.use("*", cors);
  app.get("/", (ctx) => ctx.text("ok"));
  app.all("/mcp", (ctx) => ctx.text("ok"));
  app.post(WEBHOOK_INGEST_PATH, (ctx) => ctx.text("ok"));
  return app;
}

const EXTENSION_ORIGIN = "chrome-extension://adoiifkpgaibbkgbicbdhpeoffmblbeb";

const WEBHOOK_INGEST_PATH = "/api/v1/w/wsId/triggers/hooks/srcId/urlSecret";

const PROVIDER_ORIGIN = "https://api.gocardless.com";

function getExposedHeaders(response: Response): string[] {
  return (
    response.headers.get("Access-Control-Expose-Headers")?.split(", ") ?? []
  );
}

describe("cors middleware", () => {
  it("exposes linked file metadata headers on cross-origin responses", async () => {
    const response = await createApp().request("/", {
      headers: { Origin: APP_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(getExposedHeaders(response)).toContain(DUST_FILE_ID_HEADER);
    expect(getExposedHeaders(response)).toContain(
      DUST_FILE_CONTENT_TYPE_HEADER
    );
  });

  it("exposes linked file metadata headers on preflight responses", async () => {
    const response = await createApp().request("/", {
      method: "OPTIONS",
      headers: { Origin: APP_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(getExposedHeaders(response)).toContain(DUST_FILE_ID_HEADER);
    expect(getExposedHeaders(response)).toContain(
      DUST_FILE_CONTENT_TYPE_HEADER
    );
  });

  it("rejects a non-allowlisted origin on regular endpoints", async () => {
    const response = await createApp().request("/", {
      headers: { Origin: EXTENSION_ORIGIN },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("X-CORS-Reason")).toBe("origin");
  });

  it("allows any origin on /mcp without credentials", async () => {
    // /mcp is Bearer-JWT-only (no cookies), so it is served as a public CORS
    // endpoint for third-party MCP clients registered via DCR.
    const response = await createApp().request("/mcp", {
      method: "POST",
      headers: { Origin: EXTENSION_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("lets a webhook delivery through whatever origin it carries", async () => {
    // Providers such as GoCardless send an Origin on server-to-server POSTs; the endpoint
    // authenticates on its URL secret and payload signature, not on cookies.
    const response = await createApp().request(WEBHOOK_INGEST_PATH, {
      method: "POST",
      headers: { Origin: PROVIDER_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("answers /mcp preflight for any origin, echoing requested headers", async () => {
    const response = await createApp().request("/mcp", {
      method: "OPTIONS",
      headers: {
        Origin: EXTENSION_ORIGIN,
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(
      response.headers.get("Access-Control-Allow-Headers")?.toLowerCase()
    ).toContain("authorization");
  });
});
