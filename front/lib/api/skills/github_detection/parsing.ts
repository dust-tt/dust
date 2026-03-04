import type {
  GitHubTreeEntry,
  SkillDetectionError,
  SkillDirectory,
} from "@app/lib/api/skills/github_detection/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import * as yaml from "js-yaml";
import { z } from "zod";

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

  if (url.hostname !== "github.com") {
    return new Err({
      type: "not_found",
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
      type: "not_found",
      message: `Invalid GitHub repository identifier: "${input}". Expected "owner/repo".`,
    });
  }

  return new Ok({ owner: segments[0], repo: segments[1] });
}

const SkillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

/**
 * Parses a SKILL.md file per the Agent Skills spec
 * (https://agentskills.io/specification). Extracts required `name` and
 * `description` from YAML frontmatter; returns the body as instructions.
 * Empty `name`/`description` means the frontmatter is missing or invalid.
 */
export function parseSkillMarkdown(markdown: string): {
  name: string;
  description: string;
  instructions: string;
} {
  const frontmatter = extractFrontmatter(markdown);

  if (!frontmatter) {
    return { name: "", description: "", instructions: markdown };
  }

  let raw: unknown;
  try {
    raw = yaml.load(frontmatter.yaml);
  } catch {
    // The lib throws on malformed YAML.
    return { name: "", description: "", instructions: frontmatter.body };
  }

  const parsed = SkillFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    return { name: "", description: "", instructions: frontmatter.body };
  }

  return {
    name: parsed.data.name.trim(),
    description: parsed.data.description.trim(),
    instructions: frontmatter.body,
  };
}

/**
 * Extracts YAML frontmatter (between `---` markers) and the remaining body.
 * Returns null if the file doesn't start with a `---` line. The closing `---`
 * must also be on its own line (not embedded in other content).
 */
function extractFrontmatter(
  markdown: string
): { yaml: string; body: string } | null {
  const lines = markdown.split("\n");

  if (!lines[0] || lines[0].trim() !== "---") {
    return null;
  }

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return {
        yaml: lines.slice(1, i).join("\n").trim(),
        body: lines
          .slice(i + 1)
          .join("\n")
          .trimStart(),
      };
    }
  }

  return null;
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
