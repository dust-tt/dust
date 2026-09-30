import { describe, expect, it } from "vitest";

import {
  ensurePrivateNoStoreCache,
  PRIVATE_NO_STORE_CACHE_CONTROL,
} from "./private_no_store_cache";

describe("ensurePrivateNoStoreCache", () => {
  it("sets private, no-store when Cache-Control is absent", () => {
    const response = ensurePrivateNoStoreCache(new Response("{}"));
    expect(response.headers.get("Cache-Control")).toBe(
      PRIVATE_NO_STORE_CACHE_CONTROL
    );
  });

  it("does not overwrite an intentional Cache-Control", () => {
    const response = new Response("bytes");
    response.headers.set("Cache-Control", "private, max-age=3600");
    const result = ensurePrivateNoStoreCache(response);
    expect(result.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(result).toBe(response);
  });
});
