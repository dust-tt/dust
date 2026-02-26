import type {
  GitHubTreeEntry,
  SkillDetectionError,
  SkillDirectory,
} from "@app/lib/api/skills/github_detection/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const SKILL_MD_FILENAME = "skill.md";

/**
 * Parses a GitHub repository identifier from various formats:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "https://github.com/owner/repo.git"
 */
export function parseGitHubRepoUrl(
  input: string
): Result<{ owner: string; repo: string }, SkillDetectionError> {
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
      type: "not_found",
      message: `Invalid GitHub repository identifier: "${input}". Expected "owner/repo".`,
    });
  }

  // Extract path segments, stripping leading/trailing slashes and .git suffix.
  const segments = url.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length < 2 || !segments[0] || !segments[1]) {
    return new Err({
      type: "not_found",
      message: `Invalid GitHub repository identifier: "${input}". Expected "owner/repo".`,
    });
  }

  return new Ok({ owner: segments[0], repo: segments[1] });
}

/**
 * Extracts the first non-empty paragraph from a markdown string,
 * skipping YAML frontmatter (--- delimited) and headings.
 */
export function extractDescription(markdown: string): string {
  let content = markdown;

  // Strip YAML frontmatter.
  if (content.startsWith("---")) {
    const endIndex = content.indexOf("---", 3);
    if (endIndex !== -1) {
      content = content.slice(endIndex + 3);
    }
  }

  const lines = content.split("\n");
  const paragraphLines: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines before a paragraph starts.
    if (!trimmed) {
      if (inParagraph) {
        break;
      }
      continue;
    }

    // Skip headings.
    if (trimmed.startsWith("#")) {
      if (inParagraph) {
        break;
      }
      continue;
    }

    inParagraph = true;
    paragraphLines.push(trimmed);
  }

  return paragraphLines.join(" ");
}

/**
 * Scans the tree for directories containing skill.md or SKILL.md.
 */
export function findSkillDirectories(
  tree: GitHubTreeEntry[]
): SkillDirectory[] {
  const skillDirs: SkillDirectory[] = [];
  const seenDirs = new Set<string>();

  for (const entry of tree) {
    if (entry.type !== "blob") {
      continue;
    }

    const filename = entry.path.split("/").pop() ?? "";
    if (filename.toLowerCase() !== SKILL_MD_FILENAME) {
      continue;
    }

    const lastSlash = entry.path.lastIndexOf("/");
    // Skip skill.md at the repo root, a skill must live in a directory.
    if (lastSlash === -1) {
      continue;
    }
    const dirPath = entry.path.slice(0, lastSlash);

    // Avoid duplicates if a directory has both skill.md and SKILL.md.
    if (seenDirs.has(dirPath)) {
      continue;
    }
    seenDirs.add(dirPath);

    skillDirs.push({
      dirPath,
      skillMdPath: entry.path,
      skillMdSha: entry.sha,
    });
  }

  return skillDirs;
}
