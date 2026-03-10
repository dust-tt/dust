import type {
  GitHubSkillDirectory,
  GitHubTreeEntry,
} from "@app/lib/api/skills/detection/github/types";
import { findSkillDirectories } from "@app/lib/api/skills/detection/parsing";
import type { FileEntry } from "@app/lib/api/skills/detection/types";

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
  const fileEntries: FileEntry[] = [];
  for (const entry of tree) {
    if (entry.type === "blob") {
      shaByPath.set(entry.path, entry.sha);
      fileEntries.push({
        path: entry.path,
        isFile: true,
        sizeBytes: entry.size ?? 0,
      });
    }
  }

  const baseDirs = findSkillDirectories(fileEntries);

  const skillDirs: GitHubSkillDirectory[] = [];
  for (const dir of baseDirs) {
    const sha = shaByPath.get(dir.skillMdPath);
    if (sha) {
      skillDirs.push({ ...dir, skillMdSha: sha });
    }
  }

  return { skillDirs, fileEntries };
}
