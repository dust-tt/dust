import { podDatabaseNameWithoutAppPrefix } from "@app/lib/api/sandbox_functions/db_naming";
import { describe, expect, it } from "vitest";

describe("podDatabaseNameWithoutAppPrefix", () => {
  it("strips the app prefix, leaving the name the schema file declares", () => {
    expect(podDatabaseNameWithoutAppPrefix("people_tracker__people")).toBe(
      "people"
    );
  });

  it("returns the whole name for a database with no app prefix", () => {
    expect(podDatabaseNameWithoutAppPrefix("chat")).toBe("chat");
  });
});
