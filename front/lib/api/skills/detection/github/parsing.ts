import type {
  GitHubSkillDetectionError,
  GitHubSkillDirectory,
  GitHubTreeEntry,
} from "@app/lib/api/skills/detection/github/types";
import { findSkillDirectories } from "@app/lib/api/skills/detection/parsing";
import type { FileEntry } from "@app/lib/api/skills/detection/types";
import { parseGitHubRepoUrl as parseGitHubRepoUrlShared } from "@app/lib/skill";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Wraps the shared parseGitHubRepoUrl with Result error handling for use in
 * the detection pipeline.
 */
export function parseGitHubRepoUrl(
  input: string
): Result<{ owner: string; repo: string }, GitHubSkillDetectionError> {
  const result = parseGitHubRepoUrlShared(input);
  if (!result) {
    return new Err({
      type: "invalid_url",
      message: `Invalid GitHub repository identifier: "${input}". Expected "owner/repo".`,
    });
  }
  return new Ok(result);
}

/**
 * Scans a GitHub tree for directories containing skill.md or SKILL.md.
 * Enriches the shared SkillDirectory with the blob SHA for content fetching.
 * Also returns the computed fileEntries so callers don't need to rebuild them.
 */
export function findGitHubSkillDirectories(tree: GitHubTreeEntry[]): {
  skillDirs: GitHubSkillDirectory[];
  fileEntries: FileEntry[];
} {
  const shaByPath = new Map<string, string>();
  for (const entry of tree) {
    if (entry.type === "blob") {
      shaByPath.set(entry.path, entry.sha);
    }
  }

  const fileEntries: FileEntry[] = tree
    .filter((e) => e.type === "blob")
    .map((e) => ({
      path: e.path,
      isFile: true,
      sizeBytes: e.size ?? 0,
    }));

  const baseDirs = findSkillDirectories(fileEntries);

  const skillDirs = baseDirs.map((dir) => ({
    ...dir,
    skillMdSha: shaByPath.get(dir.skillMdPath) ?? "",
  }));

  return { skillDirs, fileEntries };
}
