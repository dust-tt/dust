import { describe, expect, it } from "vitest";
import { isUnsupportedUnicodeDatabaseError } from "./errors";

describe("isUnsupportedUnicodeDatabaseError", () => {
  it.each([
    { code: "22P05" },
    { original: { code: "22P05" } },
    { parent: { code: "22P05" } },
  ])("recognizes a PostgreSQL 22P05 error: %j", (error) => {
    expect(isUnsupportedUnicodeDatabaseError(error)).toBe(true);
  });

  it("does not classify unrelated errors", () => {
    expect(
      isUnsupportedUnicodeDatabaseError({
        original: { code: "23505" },
        message: "duplicate key value violates unique constraint",
      })
    ).toBe(false);
  });
});
