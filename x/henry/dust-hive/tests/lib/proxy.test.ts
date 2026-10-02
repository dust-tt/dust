import { describe, expect, it } from "bun:test";
import { routeFor, startProxy } from "../../src/proxy-daemon";

describe("proxy routing", () => {
  it("allows a silent 25-second poll to complete", async () => {
    const upstream = Bun.serve({
      port: 0,
      hostname: "localhost",
      idleTimeout: 60,
      async fetch() {
        await Bun.sleep(25_000);
        return Response.json({ events: [] });
      },
    });
    const proxy = startProxy(0, { "front-api": upstream.port ?? 0, marketing: upstream.port ?? 0 });
    try {
      const response = await fetch(`http://localhost:${proxy.port}/api/events/poll`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ events: [] });
    } finally {
      proxy.stop(true);
      upstream.stop(true);
    }
  }, 30_000);

  describe("routeFor", () => {
    it("routes /api/* to front-api", () => {
      expect(routeFor("/api/auth-context")).toBe("front-api");
      expect(routeFor("/api/w/wsid/agents")).toBe("front-api");
      expect(routeFor("/api/")).toBe("front-api");
      expect(routeFor("/api")).toBe("front-api");
    });

    it("routes /m/api/* to marketing (despite the /api substring)", () => {
      expect(routeFor("/m/api/contact")).toBe("marketing");
      expect(routeFor("/m/api/")).toBe("marketing");
      expect(routeFor("/m/api")).toBe("marketing");
    });

    it("routes everything else to marketing", () => {
      expect(routeFor("/")).toBe("marketing");
      expect(routeFor("/home")).toBe("marketing");
      expect(routeFor("/customers/foo")).toBe("marketing");
      expect(routeFor("/blog/post")).toBe("marketing");
      expect(routeFor("/m/something-else")).toBe("marketing");
    });

    it("does not confuse /api with /apiXyz", () => {
      // Only exact `/api` or `/api/...` should route to front-api.
      expect(routeFor("/apidocs")).toBe("marketing");
      expect(routeFor("/api-test")).toBe("marketing");
    });

    it("does not match /api/m/* as marketing — only /m/api/* does", () => {
      // /api/m/foo starts with /api/ so it's an API request, not marketing.
      expect(routeFor("/api/m/foo")).toBe("front-api");
    });
  });
});
