import {
  getRequestContext,
  RequestCachedQuery,
  type RequestQueryCache,
} from "@app/types/shared/utils/request_context";
import { createHono } from "@front-api/lib/hono";
import {
  configureHonoRequestStorage,
  type RequestStorageEnv,
} from "@front-api/lib/request_context";
import { contextStorage } from "hono/context-storage";
import { describe, expect, it } from "vitest";

import { requestInstrumentation } from "./request_instrumentation";

describe("requestInstrumentation", () => {
  it("owns the query cache on the Hono context for one request", async () => {
    const app = createHono<RequestStorageEnv>();
    const query = new RequestCachedQuery<"key", number>();
    let previousCache: RequestQueryCache | undefined;
    let loadCount = 0;

    configureHonoRequestStorage();
    app.use(contextStorage());
    app.use("*", requestInstrumentation);
    app.get("/", async (c) => {
      const honoCache = c.get("queryCache");
      const isNewRequest = previousCache !== honoCache;
      previousCache = honoCache;
      const first = query.get("key", async () => ++loadCount);
      const second = query.get("key", async () => ++loadCount);

      return c.json({
        isBridged: first === second,
        isContextBridged: getRequestContext() === c.get("requestContext"),
        isNewRequest,
        value: await first,
      });
    });

    const firstResponse = await app.request("/");
    await expect(firstResponse.json()).resolves.toEqual({
      isBridged: true,
      isContextBridged: true,
      isNewRequest: true,
      value: 1,
    });

    const secondResponse = await app.request("/");
    await expect(secondResponse.json()).resolves.toEqual({
      isBridged: true,
      isContextBridged: true,
      isNewRequest: true,
      value: 2,
    });
  });
});
