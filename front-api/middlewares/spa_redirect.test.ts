import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

// `config.getAppUrl()` / `config.getPokeAppUrl()` are mocked in vite.setup.ts to
// "http://localhost:3000" and "http://localhost:3000/poke" respectively.

describe("spaRedirect middleware", () => {
  it("redirects SPA paths to the main SPA app", async () => {
    const response = await honoApp.request("/w/123");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/w/123"
    );
  });

  it("preserves the query string when redirecting SPA paths", async () => {
    const response = await honoApp.request("/share/abc?foo=bar");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/share/abc?foo=bar"
    );
  });

  it("redirects /poke/* to the poke SPA app", async () => {
    const response = await honoApp.request("/poke/admin");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/poke/admin"
    );
  });

  it("redirects the bare /poke path to the poke SPA app", async () => {
    const response = await honoApp.request("/poke");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/poke");
  });

  it("does not redirect non-SPA paths", async () => {
    const response = await honoApp.request("/api/healthz");

    expect(response.status).toBe(200);
  });
});
