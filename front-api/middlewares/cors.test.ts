import { DUST_FILE_ID_HEADER } from "@app/types/files";
import { cors } from "@front-api/middlewares/cors";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

const APP_ORIGIN = "https://app.dust.tt";

function createApp() {
  const app = new Hono();
  app.use("*", cors);
  app.get("/", (ctx) => ctx.text("ok"));
  return app;
}

function getExposedHeaders(response: Response): string[] {
  return (
    response.headers.get("Access-Control-Expose-Headers")?.split(", ") ?? []
  );
}

describe("cors middleware", () => {
  it("exposes the linked file id header on cross-origin responses", async () => {
    const response = await createApp().request("/", {
      headers: { Origin: APP_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(getExposedHeaders(response)).toContain(DUST_FILE_ID_HEADER);
  });

  it("exposes the linked file id header on preflight responses", async () => {
    const response = await createApp().request("/", {
      method: "OPTIONS",
      headers: { Origin: APP_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(getExposedHeaders(response)).toContain(DUST_FILE_ID_HEADER);
  });
});
