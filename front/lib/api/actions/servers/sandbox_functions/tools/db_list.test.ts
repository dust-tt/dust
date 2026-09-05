import { formatDatabasesList } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_list";
import { SANDBOX_DATABASE_NAME_REGEX } from "@app/types/api/sandbox_functions";
import { describe, expect, it } from "vitest";
import { DB_NAME_REGEX } from "../../../../../../../cli/dust-sandbox/functions-runner/types/db";

describe("formatDatabasesList", () => {
  it("returns an explicit empty message when there are none", () => {
    expect(formatDatabasesList([])).toBe("No project databases.");
  });

  it("renders each database with its size and points at db_schema/db_query", () => {
    const out = formatDatabasesList([
      { name: "chat", sizeBytes: 12648 },
      { name: "notes", sizeBytes: 4096 },
    ]);

    expect(out).toBe(
      [
        "Project databases:",
        "- chat (12648 bytes)",
        "- notes (4096 bytes)",
        "",
        "Use db_schema to inspect one or db_query to run SQL.",
      ].join("\n")
    );
  });
});

// The db tools pre-validate database names with front's mirrored regex; dsbx enforces the
// same contract with DB_NAME_REGEX. Regex values cannot be type-checked and front cannot
// runtime-import cli code, so their equality is asserted here.
describe("SANDBOX_DATABASE_NAME_REGEX", () => {
  it("keeps the database name regex identical to the runner's", () => {
    expect(SANDBOX_DATABASE_NAME_REGEX.source).toBe(DB_NAME_REGEX.source);
    expect(SANDBOX_DATABASE_NAME_REGEX.flags).toBe(DB_NAME_REGEX.flags);
  });
});
