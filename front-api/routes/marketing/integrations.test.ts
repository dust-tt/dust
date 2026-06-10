import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/marketing/integrations", () => {
  it("returns the public integration registry", async () => {
    const response = await honoApp.request("/api/marketing/integrations");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.integrations)).toBe(true);
    expect(body.integrations.length).toBeGreaterThan(0);
  });
});
