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
