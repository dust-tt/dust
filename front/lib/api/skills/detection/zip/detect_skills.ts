import {
  collectAttachments,
  findSkillDirectories,
  parseSkillMarkdown,
} from "@app/lib/api/skills/detection/parsing";
import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import { stripCommonZipPrefix } from "@app/lib/api/skills/detection/zip/parsing";
import type {
  ZipEntry,
  ZipSkillDetectionError,
} from "@app/lib/api/skills/detection/zip/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import AdmZip from "adm-zip";

/**
 * Extracts a flat list of ZipEntry from a ZIP buffer using adm-zip.
 */
function extractZipEntries(
  zipBuffer: Buffer
): Result<{ entries: ZipEntry[]; zip: AdmZip }, ZipSkillDetectionError> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (err) {
    return new Err({
      type: "invalid_zip",
      message: `Failed to open ZIP: ${normalizeError(err).message}`,
    });
  }

  const admEntries = zip.getEntries();
  const entries: ZipEntry[] = admEntries.map((e) => ({
    path: e.entryName.replace(/\/$/, ""),
    originalEntryName: e.entryName,
    sizeBytes: e.header.size,
    isDirectory: e.isDirectory,
  }));

  return new Ok({ entries, zip });
}

/**
 * Reads a file's text content from an adm-zip instance.
 */
function readZipFileContent(
  zip: AdmZip,
  originalPath: string
): Result<string, ZipSkillDetectionError> {
  const entry = zip.getEntry(originalPath);
  if (!entry) {
    return new Err({
      type: "invalid_zip",
      message: `Entry not found in ZIP: "${originalPath}"`,
    });
  }
  const buffer = entry.getData();
  return new Ok(buffer.toString("utf-8"));
}

/**
 * Detects Agent Skills (https://agentskills.io/specification) in a ZIP archive
 * by scanning for SKILL.md files. Same logic as the GitHub detection but
 * operating on a ZIP buffer instead of the GitHub API.
 */
export function detectSkillsFromZip({
  zipBuffer,
}: {
  zipBuffer: Buffer;
}): Result<DetectedSkill[], ZipSkillDetectionError> {
  const extractResult = extractZipEntries(zipBuffer);
  if (extractResult.isErr()) {
    return extractResult;
  }
  const { entries: rawEntries, zip } = extractResult.value;

  const entries = stripCommonZipPrefix(rawEntries);
  // Map stripped path -> entry (preserves originalEntryName) for adm-zip lookup.
  const entryByPath = new Map<string, ZipEntry>();
  for (const entry of entries) {
    entryByPath.set(entry.path, entry);
  }

  const fileEntries = entries
    .filter((e) => !e.isDirectory)
    .map((e) => ({ path: e.path, isFile: true, sizeBytes: e.sizeBytes }));

  const skillDirs = findSkillDirectories(fileEntries);
  if (skillDirs.length === 0) {
    return new Ok([]);
  }

  const allSkills: DetectedSkill[] = [];

  for (const skillDir of skillDirs) {
    const skillMdEntry = entryByPath.get(skillDir.skillMdPath);
    if (!skillMdEntry) {
      continue;
    }

    const contentResult = readZipFileContent(
      zip,
      skillMdEntry.originalEntryName
    );
    if (contentResult.isErr()) {
      continue;
    }

    const parsed = parseSkillMarkdown(contentResult.value);
    allSkills.push({
      name: parsed.name,
      skillMdPath: skillDir.skillMdPath,
      description: parsed.description,
      instructions: parsed.instructions,
      attachments: collectAttachments(fileEntries, skillDir),
    });
  }

  return new Ok(allSkills.filter((s) => s.name.length > 0));
}
