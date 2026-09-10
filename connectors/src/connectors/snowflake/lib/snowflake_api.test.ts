import { describe, expect, it } from "vitest";

import { isSnowflakeDatabaseUnavailableError } from "./snowflake_api";

describe("isSnowflakeDatabaseUnavailableError", () => {
  it.each([
    "002043",
    "003030",
  ])("recognizes database-scoped error code %s", (code) => {
    const error = Object.assign(new Error("Database unavailable"), { code });

    expect(isSnowflakeDatabaseUnavailableError(error)).toBe(true);
  });

  it("does not skip an expired listing trial", () => {
    const error = Object.assign(
      new Error("Listing trial time limit exceeded"),
      {
        code: "090693",
      }
    );

    expect(isSnowflakeDatabaseUnavailableError(error)).toBe(false);
  });
});
