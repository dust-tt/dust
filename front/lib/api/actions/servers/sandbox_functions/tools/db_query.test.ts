import { formatQueryResult } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_query";
import { describe, expect, it } from "vitest";

describe("formatQueryResult", () => {
  it("renders the row count, columns and rows", () => {
    const out = formatQueryResult({
      columns: ["id", "body"],
      rows: [
        { id: 1, body: "hello" },
        { id: 2, body: "world" },
      ],
      rowCount: 2,
      changes: null,
      resultsFile: null,
      note: null,
    });

    expect(out).toContain("2 rows — columns: id, body");
    expect(out).toContain('[{"id":1,"body":"hello"},{"id":2,"body":"world"}]');
  });

  it("renders an empty result without a columns suffix", () => {
    const out = formatQueryResult({
      columns: [],
      rows: [],
      rowCount: 0,
      changes: null,
      resultsFile: null,
      note: null,
    });

    expect(out).toContain("0 rows");
    expect(out).not.toContain("columns:");
  });

  it("renders the affected-row count for plain DML", () => {
    const out = formatQueryResult({
      columns: [],
      rows: [],
      rowCount: 0,
      changes: 3,
      resultsFile: null,
      note: null,
    });

    expect(out).toBe("3 rows changed");
  });

  it("surfaces the runner's spill note when the result crossed the inline bounds", () => {
    const out = formatQueryResult({
      columns: ["id"],
      rows: [{ id: 1 }],
      rowCount: 1234,
      changes: null,
      resultsFile: "/tmp/dsbx-query-abc.jsonl",
      note: "1234 rows total; the first 100 are shown here as a preview. The complete result set is in /tmp/dsbx-query-abc.jsonl, one JSON object per line.",
    });

    expect(out).toContain("1234 rows");
    expect(out).toContain("/tmp/dsbx-query-abc.jsonl");
  });
});
