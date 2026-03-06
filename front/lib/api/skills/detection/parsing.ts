import type {
  DetectedSkillAttachment,
  FileEntry,
  SkillDirectory,
} from "@app/lib/api/skills/detection/types";
import * as yaml from "js-yaml";
import { z } from "zod";

const SKILL_MD_FILENAME = "skill.md";

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
 * Scans file entries for directories containing a SKILL.md (case-insensitive).
 * Skips root-level skill.md files and deduplicates by directory.
 */
export function findSkillDirectories(entries: FileEntry[]): SkillDirectory[] {
  const skillDirs: SkillDirectory[] = [];
  const seenDirs = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile) {
      continue;
    }

    const filename = entry.path.split("/").pop() ?? "";
    if (filename.toLowerCase() !== SKILL_MD_FILENAME) {
      continue;
    }

    const lastSlash = entry.path.lastIndexOf("/");
    // A skill must live in a directory, not at the root.
    if (lastSlash === -1) {
      continue;
    }
    const dirPath = entry.path.slice(0, lastSlash);

    // Avoid duplicates if a directory has both skill.md and SKILL.md.
    if (seenDirs.has(dirPath)) {
      continue;
    }
    seenDirs.add(dirPath);

    skillDirs.push({ dirPath, skillMdPath: entry.path });
  }

  return skillDirs;
}

/**
 * Collects file attachments for a skill directory — all files under
 * `skillDir` except the SKILL.md itself, with paths relative to the dir.
 * O(skills * entries) — acceptable: skills < ~20, entries < ~1000.
 */
export function collectAttachments(
  entries: FileEntry[],
  skillDir: SkillDirectory
): DetectedSkillAttachment[] {
  const dirPrefix = skillDir.dirPath + "/";
  const attachments: DetectedSkillAttachment[] = [];

  for (const entry of entries) {
    if (!entry.isFile) {
      continue;
    }
    if (!entry.path.startsWith(dirPrefix)) {
      continue;
    }
    if (entry.path === skillDir.skillMdPath) {
      continue;
    }
    const relativePath = entry.path.slice(dirPrefix.length);
    attachments.push({ path: relativePath, sizeBytes: entry.sizeBytes });
  }

  return attachments;
}
