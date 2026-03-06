import { describe, expect, test } from "vitest";

import { stripCommonZipPrefix } from "./parsing";
import type { ZipEntry } from "./types";

function makeEntry(
  path: string,
  opts: { isDirectory?: boolean } = {}
): ZipEntry {
  return {
    path,
    originalEntryName: opts.isDirectory ? path + "/" : path,
    sizeBytes: 100,
    isDirectory: opts.isDirectory ?? false,
  };
}

describe("stripCommonZipPrefix", () => {
  test("strips single common top-level directory", () => {
    const entries = [
      makeEntry("repo-main", { isDirectory: true }),
      makeEntry("repo-main/skills/foo/SKILL.md"),
      makeEntry("repo-main/skills/bar/SKILL.md"),
      makeEntry("repo-main/README.md"),
    ];

    const result = stripCommonZipPrefix(entries);
    expect(result.map((e) => e.path)).toEqual([
      "skills/foo/SKILL.md",
      "skills/bar/SKILL.md",
      "README.md",
    ]);
  });

  test("preserves originalEntryName through stripping", () => {
    const entries = [
      makeEntry("repo-main/skills/foo/SKILL.md"),
      makeEntry("repo-main/README.md"),
    ];

    const result = stripCommonZipPrefix(entries);
    expect(result[0].originalEntryName).toBe("repo-main/skills/foo/SKILL.md");
  });

  test("does not strip when files have no common prefix", () => {
    const entries = [makeEntry("foo/SKILL.md"), makeEntry("bar/SKILL.md")];

    const result = stripCommonZipPrefix(entries);
    expect(result.map((e) => e.path)).toEqual(["foo/SKILL.md", "bar/SKILL.md"]);
  });

  test("does not strip when files are at the root", () => {
    const entries = [makeEntry("SKILL.md"), makeEntry("README.md")];

    const result = stripCommonZipPrefix(entries);
    expect(result.map((e) => e.path)).toEqual(["SKILL.md", "README.md"]);
  });

  test("returns entries unchanged when all are directories", () => {
    const entries = [
      makeEntry("repo-main", { isDirectory: true }),
      makeEntry("repo-main/skills", { isDirectory: true }),
    ];

    const result = stripCommonZipPrefix(entries);
    expect(result).toEqual(entries);
  });

  test("filters out entries that become empty after stripping", () => {
    const entries = [
      makeEntry("repo-main", { isDirectory: true }),
      makeEntry("repo-main/file.txt"),
    ];

    const result = stripCommonZipPrefix(entries);
    // The directory entry "repo-main" becomes "" after stripping, so it's filtered out.
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("file.txt");
  });
});
