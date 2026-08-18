import { afterEach, describe, expect, it } from "vitest";

import {
  RequestCachedQuery,
  RequestQueryCache,
  setRequestStorageResolver,
} from "./request_context";

const requestContext = {
  method: "GET",
  route: "/test",
  url: "/test",
};

describe("RequestCachedQuery", () => {
  afterEach(() => {
    setRequestStorageResolver(null);
  });

  it("deduplicates within a request and reloads on the next request", async () => {
    const query = new RequestCachedQuery<string, { load: number }>();
    let loadCount = 0;
    const load = async () => ({ load: ++loadCount });
    let queryCache = new RequestQueryCache();

    setRequestStorageResolver(() => ({ queryCache, requestContext }));

    const first = query.get("key", load);
    const second = query.get("key", load);
    expect(second).toBe(first);
    await expect(first).resolves.toEqual({ load: 1 });

    queryCache = new RequestQueryCache();
    await expect(query.get("key", load)).resolves.toEqual({ load: 2 });
  });

  it("does not cache when no request storage adapter is installed", async () => {
    const query = new RequestCachedQuery<string, number>();
    let loadCount = 0;
    const load = async () => ++loadCount;

    await expect(query.get("key", load)).resolves.toBe(1);
    await expect(query.get("key", load)).resolves.toBe(2);
  });
});
