// @vitest-environment node

import { isCacheMissReason } from "@app/lib/model_constructors/utils/cache_miss_reason";
import { describe, expect, it } from "vitest";

describe("isCacheMissReason", () => {
  it("accepts a reason with the optional token count", () => {
    expect(
      isCacheMissReason({ type: "system_changed", cacheMissedInputTokens: 42 })
    ).toBe(true);
  });

  it("accepts a reason without the token count", () => {
    expect(isCacheMissReason({ type: "no_previous_message" })).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isCacheMissReason(undefined)).toBe(false);
    expect(isCacheMissReason({})).toBe(false);
    expect(isCacheMissReason({ type: 1 })).toBe(false);
  });
});
