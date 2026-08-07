import {
  buildTableRowCountsQuery,
  quoteSqliteIdentifier,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { describe, expect, it } from "vitest";

describe("quoteSqliteIdentifier", () => {
  it("wraps a plain name in double quotes", () => {
    expect(quoteSqliteIdentifier("messages")).toBe('"messages"');
  });

  it("escapes an embedded double quote by doubling it", () => {
    expect(quoteSqliteIdentifier('we"ird')).toBe('"we""ird"');
  });

  it("keeps a statement-terminating name inside the quoted identifier", () => {
    // A table named this way can only come from `sqlite_master`, but it must stay one identifier.
    expect(quoteSqliteIdentifier('a"; DROP TABLE users; --')).toBe(
      '"a""; DROP TABLE users; --"'
    );
  });
});

describe("buildTableRowCountsQuery", () => {
  it("counts a single table", () => {
    expect(buildTableRowCountsQuery(["messages"])).toBe(
      'SELECT 0 AS idx, COUNT(*) AS row_count FROM "messages" ORDER BY idx'
    );
  });

  it("addresses tables by index so no name is ever a SQL literal", () => {
    const sql = buildTableRowCountsQuery(["messages", "threads"]);

    expect(sql).toBe(
      'SELECT 0 AS idx, COUNT(*) AS row_count FROM "messages" UNION ALL ' +
        'SELECT 1 AS idx, COUNT(*) AS row_count FROM "threads" ORDER BY idx'
    );
    expect(sql).not.toContain("'");
  });

  it("quotes hostile table names rather than interpolating them raw", () => {
    const sql = buildTableRowCountsQuery(['a" UNION SELECT 1, 1 --']);

    expect(sql).toContain('FROM "a"" UNION SELECT 1, 1 --"');
  });
});
