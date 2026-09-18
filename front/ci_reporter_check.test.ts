import { describe, expect, it } from "vitest";

// TEMPORARY: deliberately failing test to verify CI surfaces the real failing
// test file/name in the log. Revert before merging (PR #32715).
describe("ci reporter check", () => {
  it("should be reverted before merge", () => {
    const value: string | null = null;
    expect(value).not.toBeNull();
  });
});
