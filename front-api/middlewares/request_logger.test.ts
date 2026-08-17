import type {
  RequestQueryCache,
  RequestStorageEnv,
} from "@app/types/shared/utils/request_context";
import { getRequestQueryCache } from "@app/types/shared/utils/request_context";
import { createHono } from "@front-api/lib/hono";
import { contextStorage } from "hono/context-storage";
import { describe, expect, it } from "vitest";

import { requestLogger } from "./request_logger";

describe("requestLogger", () => {
  it("owns the query cache on the Hono context for one request", async () => {
    const app = createHono<RequestStorageEnv>();
    let previousCache: RequestQueryCache | undefined;

    app.use(contextStorage());
    app.use("*", requestLogger);
    app.get("/", (c) => {
      const honoCache = c.get("queryCache");
      const isBridged = getRequestQueryCache() === honoCache;
      const isNewRequest = previousCache !== honoCache;
      previousCache = honoCache;

      return c.json({ isBridged, isNewRequest });
    });

    const firstResponse = await app.request("/");
    await expect(firstResponse.json()).resolves.toEqual({
      isBridged: true,
      isNewRequest: true,
    });

    const secondResponse = await app.request("/");
    await expect(secondResponse.json()).resolves.toEqual({
      isBridged: true,
      isNewRequest: true,
    });
  });
});
