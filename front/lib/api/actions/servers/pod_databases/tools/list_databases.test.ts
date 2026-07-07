import { formatDatabasesList } from "@app/lib/api/actions/servers/pod_databases/tools/list_databases";
import { describe, expect, it } from "vitest";

describe("formatDatabasesList", () => {
  it("returns an explicit empty message", () => {
    expect(formatDatabasesList([], new Map())).toContain("no databases yet");
  });

  it("lists live databases with sizes and declaring functions", () => {
    const out = formatDatabasesList(
      [
        { name: "chat", sizeBytes: 4096 },
        { name: "notes", sizeBytes: 2 * 1024 * 1024 },
      ],
      new Map([
        ["chat", ["list-messages", "post-message"]],
        ["notes", ["take-note"]],
      ])
    );

    expect(out).toContain(
      "- chat (4.0 KB) — declared by: list-messages, post-message"
    );
    expect(out).toContain("- notes (2.0 MB) — declared by: take-note");
    expect(out).toContain("get_schema");
  });

  it("flags untracked leftovers", () => {
    const out = formatDatabasesList(
      [{ name: "old_db", sizeBytes: 12 }],
      new Map()
    );
    expect(out).toContain(
      "- old_db (12 B) — UNTRACKED: no published function declares it anymore"
    );
  });

  it("flags declared databases without a live file", () => {
    const out = formatDatabasesList([], new Map([["chat", ["post-message"]]]));
    expect(out).toContain(
      "- chat — declared by post-message but no live database file exists yet"
    );
  });
});
