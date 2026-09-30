import {
  collectAttachments,
  findSkillDirectories,
  parseSkillMarkdown,
} from "@app/lib/api/skills/detection/parsing";
import { stripCommonZipPrefix } from "@app/lib/api/skills/detection/zip/parsing";
import type {
  ZipDetectedSkill,
  ZipDetectedSkillAttachment,
  ZipEntry,
} from "@app/lib/api/skills/detection/zip/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import AdmZip from "adm-zip";

export const MAX_ZIP_SIZE_BYTES = 5 * 1024 * 1024;
// Total uncompressed size limit (prevents issues with small zip but
// super large uncompressed data).
const MAX_DECOMPRESSED_SIZE_BYTES = 10 * 1024 * 1024;
// Entry count cap. The SKILL.md scanner is O(entries × skill-dirs); without
// this a 5 MB zip with ~80 k tiny entries would cause quadratic CPU work that
// blocks the shared front-api event loop for all tenants. With the cap, the
// scan is at most O(MAX_ZIP_ENTRIES²). Skill-directory count is not rejected
// on its own: a small archive with more than 50 skills was a valid public
// API import.
export const MAX_ZIP_ENTRIES = 1_000;

/**
 * Extracts a flat list of ZipEntry from a ZIP buffer using adm-zip.
 */
/**
 * @cc [owner:frankaloia,label:security;performance] zip-entry-count-cap
 * MUST return Err when the central-directory entry count exceeds
 * `MAX_ZIP_ENTRIES` (1000), and MUST do so before mapping records into
 * `ZipEntry` objects. An over-cap archive MUST NOT be returned for
 * decompressed-size summation or skill-directory scanning.
 */
function extractZipEntries(
  zipBuffer: Buffer
): Result<{ entries: ZipEntry[]; zip: AdmZip }, Error> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (err) {
    return new Err(
      new Error(`Failed to open ZIP: ${normalizeError(err).message}`)
    );
  }

  const admEntries = zip.getEntries();
  // Reject before mapping each entry into a ZipEntry. getEntries() is the
  // already-parsed central directory; the map below is the per-entry work.
  if (admEntries.length > MAX_ZIP_ENTRIES) {
    return new Err(
      new Error(
        `ZIP contains too many entries (${admEntries.length}). ` +
          `Maximum allowed is ${MAX_ZIP_ENTRIES}.`
      )
    );
  }

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
): Result<string, Error> {
  const entry = zip.getEntry(originalPath);
  if (!entry) {
    return new Err(new Error(`Entry not found in ZIP: "${originalPath}"`));
  }
  const buffer = entry.getData();

  return new Ok(buffer.toString("utf-8"));
}

/**
 * Validates zip size limits and extracts entries + the AdmZip instance.
 * Shared between detection and attachment reading.
 */
function openAndValidateZip(
  zipBuffer: Buffer
): Result<{ entries: ZipEntry[]; zip: AdmZip }, Error> {
  if (zipBuffer.length > MAX_ZIP_SIZE_BYTES) {
    return new Err(
      new Error(
        `ZIP file too large (${Math.round(zipBuffer.length / 1024 / 1024)} MB). ` +
          `Maximum allowed size is ${MAX_ZIP_SIZE_BYTES / 1024 / 1024} MB.`
      )
    );
  }

  const extractResult = extractZipEntries(zipBuffer);
  if (extractResult.isErr()) {
    return extractResult;
  }
  const { entries: rawEntries, zip } = extractResult.value;

  let totalDecompressedSizeBytes = 0;
  for (const entry of rawEntries) {
    totalDecompressedSizeBytes += entry.sizeBytes;
  }
  if (totalDecompressedSizeBytes > MAX_DECOMPRESSED_SIZE_BYTES) {
    const sizeMb = Math.round(totalDecompressedSizeBytes / 1024 / 1024);
    return new Err(
      new Error(
        `Total decompressed size too large (${sizeMb} MB). ` +
          `Maximum allowed is ${MAX_DECOMPRESSED_SIZE_BYTES / 1024 / 1024} MB.`
      )
    );
  }

  return new Ok({ entries: rawEntries, zip });
}

/**
 * Detects Agent Skills (https://agentskills.io/specification) in a ZIP archive
 * by scanning for SKILL.md files. Returns ZipDetectedSkill[] where each
 * attachment carries an `originalEntryName` (the raw zip path before prefix
 * stripping), analogous to the `sha` in GitHubDetectedSkillAttachment.
 */
/**
 * @cc [owner:frankaloia,label:security;api] zip-skill-directory-count-accepted
 * Skill-directory count alone MUST NOT reject an archive and MUST NOT truncate
 * the detected skills. A small archive with more than 50 skill directories MUST
 * still be detected, including when a later `names` filter selects a single
 * skill (`api-backward-compatibility`).
 */
export function detectSkillsFromZip({
  zipBuffer,
}: {
  zipBuffer: Buffer;
}): Result<ZipDetectedSkill[], Error> {
  const openResult = openAndValidateZip(zipBuffer);
  if (openResult.isErr()) {
    return openResult;
  }
  const { entries: rawEntries, zip } = openResult.value;

  const entries = stripCommonZipPrefix(rawEntries);
  // Map stripped path -> entry (preserves originalEntryName) for adm-zip lookup.
  const entryByPath = new Map<string, ZipEntry>();
  for (const entry of entries) {
    entryByPath.set(entry.path, entry);
  }

  const fileEntries = entries
    .filter((e) => !e.isDirectory)
    .map((e) => ({ path: e.path, sizeBytes: e.sizeBytes }));

  const skillDirs = findSkillDirectories(fileEntries);
  if (skillDirs.length === 0) {
    return new Ok([]);
  }

  const allSkills: ZipDetectedSkill[] = [];

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
      logger.warn(
        { error: contentResult.error, path: skillDir.skillMdPath },
        "Failed to read SKILL.md from ZIP, skipping."
      );
      continue;
    }

    const parsed = parseSkillMarkdown(contentResult.value);

    // Enrich each attachment with originalEntryName so the import flow can
    // extract content without re-parsing the zip structure.
    const baseAttachments = collectAttachments(fileEntries, skillDir);
    const attachments: ZipDetectedSkillAttachment[] = baseAttachments.map(
      (a) => ({
        ...a,
        originalEntryName: entryByPath.get(a.path)?.originalEntryName ?? a.path,
      })
    );

    allSkills.push({
      name: parsed.name,
      skillMdPath: skillDir.skillMdPath,
      description: parsed.description,
      instructions: parsed.instructions,
      attachments,
    });
  }

  return new Ok(allSkills.filter((s) => s.name.length > 0));
}

/**
 * Returns a reader function that reads a zip entry's raw bytes by
 * originalEntryName. Open this once per buffer; pass it to the import flow
 * to extract attachment content without re-parsing the zip structure.
 */
export function createZipAttachmentReader(
  zipBuffer: Buffer
): Result<(originalEntryName: string) => Result<Buffer, Error>, Error> {
  const openResult = openAndValidateZip(zipBuffer);
  if (openResult.isErr()) {
    return openResult;
  }
  const { zip } = openResult.value;

  return new Ok((originalEntryName: string): Result<Buffer, Error> => {
    const entry = zip.getEntry(originalEntryName);
    if (!entry) {
      return new Err(new Error(`ZIP entry not found: "${originalEntryName}"`));
    }
    return new Ok(entry.getData());
  });
}
