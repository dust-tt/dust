import type {
  GitHubSkillDetectionError,
  GitHubSkillDirectory,
  GitHubTreeEntry,
} from "@app/lib/api/skills/detection/github/types";
import { findSkillDirectories } from "@app/lib/api/skills/detection/parsing";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Parses a GitHub repository identifier from various formats:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "https://github.com/owner/repo.git"
 */
export function parseGitHubRepoUrl(
  input: string
): Result<{ owner: string; repo: string }, GitHubSkillDetectionError> {
  const trimmed = input.trim();

  // Handles "github.com/owner/repo" (no protocol) and bare "owner/repo".
  let normalized: string;
  if (trimmed.includes("://")) {
    normalized = trimmed;
  } else if (trimmed.startsWith("github.com/")) {
    normalized = `https://${trimmed}`;
  } else {
    normalized = `https://github.com/${trimmed}`;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return new Err({
      type: "invalid_url",
      message: `Invalid GitHub repository identifier: "${input}". Expected "owner/repo".`,
    });
  }

  if (url.hostname !== "github.com") {
    return new Err({
      type: "invalid_url",
      message: `Unsupported hostname "${url.hostname}". Only github.com repositories are supported.`,
    });
  }

  // Extract path segments, stripping leading/trailing slashes and .git suffix.
  const segments = url.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length < 2 || !segments[0] || !segments[1]) {
    return new Err({
      type: "invalid_url",
      message: `Invalid GitHub repository identifier: "${input}". Expected "owner/repo".`,
    });
  }

  return new Ok({ owner: segments[0], repo: segments[1] });
}

/**
 * Scans a GitHub tree for directories containing skill.md or SKILL.md.
 * Enriches the shared SkillDirectory with the blob SHA for content fetching.
 */
export function findGitHubSkillDirectories(
  tree: GitHubTreeEntry[]
): GitHubSkillDirectory[] {
  const shaByPath = new Map<string, string>();
  for (const entry of tree) {
    if (entry.type === "blob") {
      shaByPath.set(entry.path, entry.sha);
    }
  }

  const fileEntries = tree
    .filter((e) => e.type === "blob")
    .map((e) => ({ path: e.path, isFile: true, sizeBytes: e.size ?? 0 }));

  const baseDirs = findSkillDirectories(fileEntries);

  return baseDirs.map((dir) => ({
    ...dir,
    skillMdSha: shaByPath.get(dir.skillMdPath) ?? "",
  }));
}
