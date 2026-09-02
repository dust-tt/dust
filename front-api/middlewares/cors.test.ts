import { FRAME_SHARE_TOKEN_HEADER } from "@app/types/api/sandbox_functions";
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
  return app;
}

const EXTENSION_ORIGIN = "chrome-extension://adoiifkpgaibbkgbicbdhpeoffmblbeb";

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

  it("allows the frame share token header on preflight requests", async () => {
    // Shared-frame hosts attach this header to every invocation request; a preflight that
    // rejects it breaks callFunction for all shared frames.
    const response = await createApp().request("/", {
      method: "OPTIONS",
      headers: {
        Origin: APP_ORIGIN,
        "Access-Control-Request-Headers": `content-type,${FRAME_SHARE_TOKEN_HEADER}`,
      },
    });

    expect(response.status).toBe(200);
    expect(
      response.headers.get("Access-Control-Allow-Headers")?.toLowerCase()
    ).toContain(FRAME_SHARE_TOKEN_HEADER);
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
