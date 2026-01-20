// AI assistant skill merging for multi-convention config directories
// Handles .claude, .codex, and .agents directories with priority-based merging

import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { logger } from "./logger";

// AI assistant config directories in priority order (highest first)
// When merging skills, .claude takes priority over .codex, which takes priority over .agents
// Note: This only handles skills - other config files in these directories are NOT copied
export const AI_CONFIG_DIRS = [".claude", ".codex", ".agents"] as const;
export type AiConfigDir = (typeof AI_CONFIG_DIRS)[number];

export interface SkillEntry {
  name: string;
  files: Map<string, string>; // relative path within skill -> absolute source path
}

// Recursively collect all files in a directory
// Returns a map of relative path -> absolute path
// Uses lstatSync to avoid following symlinks (prevents loops and unexpected behavior)
export function collectFilesRecursively(dir: string, basePath = ""): Map<string, string> {
  const files = new Map<string, string>();

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relativePath = basePath ? `${basePath}/${entry}` : entry;

    const stat = lstatSync(fullPath);
    // Skip symlinks to avoid loops and unexpected behavior
    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isDirectory()) {
      // Recurse into subdirectories
      const subFiles = collectFilesRecursively(fullPath, relativePath);
      for (const [subRelPath, subAbsPath] of subFiles) {
        files.set(subRelPath, subAbsPath);
      }
    } else if (stat.isFile()) {
      files.set(relativePath, fullPath);
    }
  }

  return files;
}

// Scan a config directory's skills folder and collect all skills with their files
function collectSkillsFromDir(repoRoot: string, configDir: AiConfigDir): Map<string, SkillEntry> {
  const skills = new Map<string, SkillEntry>();
  const skillsPath = join(repoRoot, configDir, "skills");

  if (!existsSync(skillsPath)) {
    return skills;
  }

  const entries = readdirSync(skillsPath);
  for (const entry of entries) {
    const skillPath = join(skillsPath, entry);
    const stat = lstatSync(skillPath);
    // Skip symlinks and non-directories
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      continue;
    }

    const files = collectFilesRecursively(skillPath);
    skills.set(entry, {
      name: entry,
      files,
    });
  }

  return skills;
}

// Merge skill maps with whole-skill override semantics
// When the same skill exists in multiple config dirs, the highest priority version wins entirely
// (no per-file merging to avoid mixed/partial skill definitions)
export function mergeSkills(
  repoRoot: string,
  configDirs: readonly AiConfigDir[]
): Map<string, SkillEntry> {
  const merged = new Map<string, SkillEntry>();

  // Process in reverse order (lowest priority first: .agents → .codex → .claude)
  // so that higher priority sources completely overwrite lower priority ones
  const reversedDirs = [...configDirs].reverse();

  for (const configDir of reversedDirs) {
    const skills = collectSkillsFromDir(repoRoot, configDir);

    for (const [skillName, skill] of skills) {
      // Whole-skill override: higher priority completely replaces lower priority
      merged.set(skillName, {
        name: skill.name,
        files: new Map(skill.files),
      });
    }
  }

  return merged;
}

// Load dust-hive skill from the dust-hive tool's own skills directory
function getDustHiveSkill(dustHiveRoot: string): SkillEntry | null {
  const skillPath = join(dustHiveRoot, ".claude", "skills", "dust-hive");

  if (!existsSync(skillPath)) {
    return null;
  }

  const files = collectFilesRecursively(skillPath);
  return {
    name: "dust-hive",
    files,
  };
}

// Write merged skills to one config directory
// Cleans up each skill directory before writing to avoid stale files from previous runs
async function writeSkillsToConfigDir(
  skills: Map<string, SkillEntry>,
  destRoot: string,
  configDir: AiConfigDir
): Promise<void> {
  const skillsDir = join(destRoot, configDir, "skills");

  for (const [skillName, skill] of skills) {
    const skillDestDir = join(skillsDir, skillName);

    // Clean up existing skill directory to avoid stale files
    if (existsSync(skillDestDir)) {
      rmSync(skillDestDir, { recursive: true, force: true });
    }

    for (const [relativePath, sourcePath] of skill.files) {
      const destPath = join(skillDestDir, relativePath);
      const destDir = dirname(destPath);

      await mkdir(destDir, { recursive: true });
      await copyFile(sourcePath, destPath);
    }
  }
}

// Main orchestration: collect skills from all AI config dirs, merge with priority,
// inject dust-hive skill, and write to all three config directories in the target worktree
export async function copyMergedSkills(
  srcDir: string,
  destDir: string,
  dustHiveRoot: string
): Promise<void> {
  // Step 1: Collect and merge skills from all config dirs
  const mergedSkills = mergeSkills(srcDir, AI_CONFIG_DIRS);

  // Step 2: Inject dust-hive skill (always overwrites any existing)
  const dustHiveSkill = getDustHiveSkill(dustHiveRoot);
  if (dustHiveSkill) {
    mergedSkills.set("dust-hive", dustHiveSkill);
  } else {
    logger.warn("dust-hive skill not found, skipping injection");
  }

  // Step 3: Write merged skills to all three config directories
  const writePromises: Promise<void>[] = [];
  for (const configDir of AI_CONFIG_DIRS) {
    writePromises.push(writeSkillsToConfigDir(mergedSkills, destDir, configDir));
  }
  await Promise.all(writePromises);

  // Log summary
  const skillCount = mergedSkills.size;
  if (skillCount > 0) {
    const skillNames = [...mergedSkills.keys()].join(", ");
    logger.success(`Merged ${skillCount} skill(s) to .claude/, .codex/, .agents/: ${skillNames}`);
  }
}
