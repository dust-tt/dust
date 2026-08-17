import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { describe, expect, it } from "vitest";

import type { RequestStorageEnv } from "./request_context";
import { RequestCachedQuery, RequestQueryCache } from "./request_context";

const requestContext = {
  method: "GET",
  route: "/test",
  url: "/test",
};

describe("RequestCachedQuery", () => {
  it("deduplicates within a request and reloads on the next request", async () => {
    const query = new RequestCachedQuery<string, { load: number }>();
    let loadCount = 0;
    const load = async () => ({ load: ++loadCount });
    const app = new Hono<RequestStorageEnv>();

    app.use(contextStorage());
    app.use(async (c, next) => {
      c.set("requestContext", requestContext);
      c.set("queryCache", new RequestQueryCache());
      return next();
    });
    app.get("/", async (c) => {
      const first = query.get("key", load);
      const second = query.get("key", load);

      expect(second).toBe(first);
      const firstValue = await first;

      return c.json({ firstValue });
    });

    await expect((await app.request("/")).json()).resolves.toEqual({
      firstValue: { load: 1 },
    });
    await expect((await app.request("/")).json()).resolves.toEqual({
      firstValue: { load: 2 },
    });
  });
});
