import type { AuthorizedFileAccessEntry } from "@app/types/files";
import {
  authorizedFileAccessEntrySchema,
  ensureFileSize,
  getActiveAuthorizedFileAccessEntries,
  getAuthorizedFileRefLabel,
  parseAuthorizedFileAccessEntry,
  resolveFileContentType,
  resolveMaxFileSizes,
} from "@app/types/files";
import { describe, expect, it } from "vitest";

describe("resolveMaxFileSizes", () => {
  it("raises the delimited limit only for sandbox conversations", () => {
    expect(
      resolveMaxFileSizes({
        hasSandboxTools: true,
        useCase: "conversation",
      }).delimited
    ).toBe(350 * 1024 * 1024);

    expect(
      resolveMaxFileSizes({
        hasSandboxTools: false,
        useCase: "conversation",
      }).delimited
    ).toBe(50 * 1024 * 1024);

    expect(
      resolveMaxFileSizes({
        hasSandboxTools: true,
        useCase: "upsert_table",
      }).delimited
    ).toBe(50 * 1024 * 1024);
  });

  it("enforces the resolved per-file limit", () => {
    expect(
      ensureFileSize("text/csv", 60 * 1024 * 1024, {
        hasSandboxTools: true,
        useCase: "conversation",
      })
    ).toBe(true);

    expect(
      ensureFileSize("text/csv", 60 * 1024 * 1024, {
        hasSandboxTools: true,
        useCase: "upsert_table",
      })
    ).toBe(false);
  });
});

describe("authorizedFileAccessEntrySchema", () => {
  const baseEntry = {
    shareScope: "workspace" as const,
    computedByUserId: "usr_abc",
    frameContentHash: "hash123",
    allowedAt: "2026-06-05T12:00:00.000Z",
  };

  it("parses file_id, canonical_path, and unverifiable entries", () => {
    const entries = [
      {
        kind: "file_id" as const,
        ref: "fil_abc",
        fileName: "data.csv",
        ...baseEntry,
      },
      {
        kind: "canonical_path" as const,
        ref: "conversation-conv123/data.csv",
        legacyPath: "conversation/data.csv",
        ...baseEntry,
      },
      {
        kind: "unverifiable" as const,
        ref: "dynamicRef",
        ...baseEntry,
      },
    ];

    for (const entry of entries) {
      expect(parseAuthorizedFileAccessEntry(entry)).toEqual(entry);
    }
  });

  it("accepts a revoked entry", () => {
    const entry = {
      kind: "file_id" as const,
      ref: "fil_abc",
      ...baseEntry,
      revokedAt: "2026-06-05T13:00:00.000Z",
    };

    expect(authorizedFileAccessEntrySchema.parse(entry)).toEqual(entry);
  });

  it("rejects legacyPath on file_id entries", () => {
    expect(() =>
      authorizedFileAccessEntrySchema.parse({
        kind: "file_id",
        ref: "fil_abc",
        legacyPath: "conversation/data.csv",
        ...baseEntry,
      })
    ).toThrow();
  });

  it("rejects fileName on unverifiable entries", () => {
    expect(() =>
      authorizedFileAccessEntrySchema.parse({
        kind: "unverifiable",
        ref: "dynamicRef",
        fileName: "data.csv",
        ...baseEntry,
      })
    ).toThrow();
  });
});

describe("getActiveAuthorizedFileAccessEntries", () => {
  const baseEntry = {
    shareScope: "workspace" as const,
    computedByUserId: "usr_abc",
    frameContentHash: "hash_v1",
    allowedAt: "2026-06-05T12:00:00.000Z",
  } satisfies Omit<AuthorizedFileAccessEntry, "kind" | "ref">;

  it("returns only entries with revokedAt = null", () => {
    const active = {
      kind: "file_id" as const,
      ref: "fil_active",
      ...baseEntry,
    };
    const revoked = {
      kind: "file_id" as const,
      ref: "fil_revoked",
      ...baseEntry,
      revokedAt: "2026-06-05T13:00:00.000Z",
    };

    expect(getActiveAuthorizedFileAccessEntries([active, revoked])).toEqual([
      active,
    ]);
    expect(getActiveAuthorizedFileAccessEntries([])).toEqual([]);
  });
});

describe("getAuthorizedFileRefLabel", () => {
  it("prefers fileName, then ref or path basename", () => {
    expect(
      getAuthorizedFileRefLabel({
        kind: "file_id",
        ref: "fil_abc",
        fileName: "report.csv",
      })
    ).toBe("report.csv");

    expect(
      getAuthorizedFileRefLabel({
        kind: "file_id",
        ref: "fil_abc",
      })
    ).toBe("fil_abc");

    expect(
      getAuthorizedFileRefLabel({
        kind: "canonical_path",
        ref: "conversation-conv_123/charts/sales.png",
      })
    ).toBe("sales.png");
  });
});

describe("resolveFileContentType", () => {
  it("normalizes Excel files reported as octet-stream", () => {
    expect(resolveFileContentType("application/octet-stream", "data.xls")).toBe(
      "application/vnd.ms-excel"
    );
    expect(
      resolveFileContentType("application/octet-stream", "data.xlsx")
    ).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
});
