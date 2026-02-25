import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

import type {
  GitHubTreeEntry,
  SkillDetectionError,
  SkillDirectory,
} from "@app/lib/api/skills/github_detection/types";

const SKILL_MD_FILENAMES = ["skill.md", "SKILL.md"];

// Content type mapping for common file extensions.
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".py": "text/x-python",
  ".sh": "text/x-shellscript",
  ".html": "text/html",
  ".css": "text/css",
  ".xml": "application/xml",
  ".xsd": "application/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Parses a GitHub repository identifier from various formats:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "github.com/owner/repo"
 */
export function parseGitHubRepoUrl(
  input: string
): Result<{ owner: string; repo: string }, SkillDetectionError> {
  let ownerRepo = input.trim();

  // Strip https://github.com/ or github.com/ prefix.
  ownerRepo = ownerRepo
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^github\.com\//, "");

  // Remove trailing slash or .git suffix.
  ownerRepo = ownerRepo.replace(/\/+$/, "").replace(/\.git$/, "");

  const parts = ownerRepo.split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return new Err({
      type: "not_found",
      message: `Invalid GitHub repository identifier: "${input}". Expected "owner/repo".`,
    });
  }

  return new Ok({ owner: parts[0], repo: parts[1] });
}

/**
 * Infers content type from a file's extension.
 */
export function getContentType(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) {
    return "application/octet-stream";
  }
  const ext = filename.slice(lastDot).toLowerCase();
  return EXTENSION_CONTENT_TYPES[ext] ?? "application/octet-stream";
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

  for (const entry of tree) {
    if (entry.type !== "blob") {
      continue;
    }

    const filename = entry.path.split("/").pop() ?? "";
    if (!SKILL_MD_FILENAMES.includes(filename)) {
      continue;
    }

    const lastSlash = entry.path.lastIndexOf("/");
    const dirPath = lastSlash === -1 ? "" : entry.path.slice(0, lastSlash);

    skillDirs.push({
      dirPath,
      skillMdPath: entry.path,
      skillMdSha: entry.sha,
    });
  }

  return skillDirs;
}
