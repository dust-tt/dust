import { formatManifestModes } from "@app/lib/api/actions/servers/pod_databases/tools/get_schema";
import type { FunctionManifests } from "@app/lib/api/sandbox_functions/manifests";
import { describe, expect, it } from "vitest";

function manifestsWithMode(mode: string | null): FunctionManifests {
  return {
    version: 1,
    databases: {
      chat: {
        schemaFile: "databases/chat.db.ts",
        tables: {
          messages: {
            columns: {
              created_at: {
                type: "integer",
                mode,
                notNull: true,
                hasDefault: false,
                primaryKey: false,
                autoIncrement: false,
              },
            },
            indexes: {},
          },
        },
      },
    },
  };
}

describe("formatManifestModes", () => {
  it("reports when no modes are declared", () => {
    const out = formatManifestModes("chat", [
      { slug: "no-db", manifests: null },
      { slug: "plain", manifests: manifestsWithMode(null) },
    ]);
    expect(out).toContain("No column modes declared");
  });

  it("lists modes with their declaring functions", () => {
    const out = formatManifestModes("chat", [
      { slug: "post-message", manifests: manifestsWithMode("timestamp") },
      { slug: "list-messages", manifests: manifestsWithMode("timestamp") },
    ]);
    expect(out).toContain(
      "- messages.created_at: mode=timestamp (declared by list-messages, post-message)"
    );
    expect(out).not.toContain("DISAGREEMENT");
  });

  it("surfaces mode disagreements between functions", () => {
    const out = formatManifestModes("chat", [
      { slug: "post-message", manifests: manifestsWithMode("timestamp") },
      { slug: "report-activity", manifests: manifestsWithMode("timestamp_ms") },
    ]);
    expect(out).toContain("mode=timestamp (declared by post-message)");
    expect(out).toContain("mode=timestamp_ms (declared by report-activity)");
    expect(out).toContain("DISAGREEMENT");
  });

  it("ignores other databases in the manifests", () => {
    const out = formatManifestModes("analytics", [
      { slug: "post-message", manifests: manifestsWithMode("timestamp") },
    ]);
    expect(out).toContain("No column modes declared");
  });
});
