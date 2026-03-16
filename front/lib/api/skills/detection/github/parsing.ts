import type {
  GitHubDetectedSkillAttachment,
  GitHubFileEntry,
  GitHubSkillDirectory,
  GitHubTreeEntry,
} from "@app/lib/api/skills/detection/github/types";
import {
  collectAttachments,
  findSkillDirectories,
} from "@app/lib/api/skills/detection/parsing";
import type { SkillDirectory } from "@app/lib/api/skills/detection/types";

/**
 * Scans a GitHub tree for directories containing skill.md or SKILL.md.
 * Enriches the shared SkillDirectory with the blob SHA for content fetching.
 */
export function findGitHubSkillDirectories(tree: GitHubTreeEntry[]): {
  skillDirs: GitHubSkillDirectory[];
  fileEntries: GitHubFileEntry[];
} {
  const fileEntries: GitHubFileEntry[] = [];
  for (const entry of tree) {
    if (entry.type === "blob") {
      fileEntries.push({
        path: entry.path,
        sizeBytes: entry.size ?? 0,
        sha: entry.sha,
      });
    }
  }

  const baseDirs = findSkillDirectories(fileEntries);

  const entriesByPath = new Map(fileEntries.map((e) => [e.path, e]));
  const skillDirs: GitHubSkillDirectory[] = [];
  for (const dir of baseDirs) {
    const entry = entriesByPath.get(dir.skillMdPath);
    if (entry) {
      skillDirs.push({ ...dir, skillMdSha: entry.sha });
    }
  }

  return { skillDirs, fileEntries };
}

/**
 * Collects attachment files for a skill directory, enriched with blob SHAs.
 */
export function collectGitHubAttachments(
  fileEntries: GitHubFileEntry[],
  skillDir: SkillDirectory
): GitHubDetectedSkillAttachment[] {
  const entriesByPath = new Map(fileEntries.map((e) => [e.path, e]));

  return collectAttachments(fileEntries, skillDir).flatMap((attachment) => {
    const entry = entriesByPath.get(attachment.path);
    if (!entry) {
      return [];
    }
    return [{ ...attachment, sha: entry.sha }];
  });
}
