import { formatDatabasesList } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_list";
import { describe, expect, it } from "vitest";

describe("formatDatabasesList", () => {
  it("returns an explicit empty message when there are none", () => {
    expect(formatDatabasesList([])).toContain("No live databases in this pod");
  });

  it("renders each database with its size and points at db_schema/db_query", () => {
    const out = formatDatabasesList([
      { name: "chat", sizeBytes: 12648 },
      { name: "notes", sizeBytes: 4096 },
    ]);

    expect(out).toContain("Pod databases:");
    expect(out).toContain("- chat (12648 bytes)");
    expect(out).toContain("- notes (4096 bytes)");
    expect(out).toContain("db_schema");
    expect(out).toContain("db_query");
  });
});
