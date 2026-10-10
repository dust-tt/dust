import { describe, expect, test } from "vitest";

import {
  collectGitHubAttachments,
  findGitHubSkillDirectories,
} from "./parsing";
import type { GitHubTreeEntry } from "./types";

function makeTreeEntry(
  path: string,
  opts: { size?: number; type?: "blob" | "tree" } = {}
): GitHubTreeEntry {
  return {
    path,
    type: opts.type ?? "blob",
    sha: `sha-${path}`,
    size: opts.size ?? 100,
    url: `https://api.github.com/repos/test/repo/git/blobs/sha-${path}`,
  };
}

describe("findGitHubSkillDirectories", () => {
  test("includes repository root SKILL.md alongside nested skills", () => {
    const tree = [
      makeTreeEntry("SKILL.md"),
      makeTreeEntry("README.md"),
      makeTreeEntry("skills/validate/SKILL.md"),
      makeTreeEntry("skills/validate/helper.py"),
    ];

    const { skillDirs, fileEntries } = findGitHubSkillDirectories(tree);

    expect(skillDirs.map((dir) => dir.skillMdPath)).toEqual([
      "SKILL.md",
      "skills/validate/SKILL.md",
    ]);
    expect(skillDirs[0]).toMatchObject({
      dirPath: ".",
      skillMdPath: "SKILL.md",
      skillMdSha: "sha-SKILL.md",
    });

    const rootAttachments = collectGitHubAttachments(fileEntries, skillDirs[0]);
    expect(rootAttachments).toEqual([
      {
        path: "README.md",
        sizeBytes: 100,
        contentType: "text/markdown",
        sha: "sha-README.md",
      },
    ]);
  });
});
