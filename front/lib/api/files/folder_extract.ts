import path from "node:path";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { DustFileSystemError } from "@app/types/file_system";
import { isDustFileSystemError } from "@app/types/file_system";
import { contentTypeFromFileName } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { IZipEntry } from "adm-zip";
import AdmZip from "adm-zip";

// Entry types the upload API rejects are still written as-is: the pod file system already holds
// arbitrary agent-written files, and silently dropping entries the user can see in their archive
// is worse than storing an opaque one.
const FALLBACK_CONTENT_TYPE = "application/octet-stream";

// Entries archiving tools add for their own bookkeeping, never part of what the user zipped.
const SKIPPED_ENTRY_NAMES = new Set([".DS_Store", "Thumbs.db"]);
const SKIPPED_ENTRY_ROOT = "__MACOSX/";

export type FolderExtractLimits = {
  maxEntries: number;
  maxUncompressedSizeBytes: number;
};

// The archive is buffered in memory and its entries are written one at a time inside a single
// request, so these sit far below what a folder download allows (see
// DEFAULT_FOLDER_ARCHIVE_LIMITS: 5,000 entries and 1 GB): a folder that can be downloaded is not
// necessarily one that can be uploaded back. The uncompressed cap is a zip-bomb guard rather than
// a size policy — it is generous against the compressed cap so ordinary archives pass, while an
// archive that expands by orders of magnitude does not.
export const DEFAULT_FOLDER_EXTRACT_LIMITS: FolderExtractLimits = {
  maxEntries: 1_000,
  maxUncompressedSizeBytes: 40 * 1024 * 1024,
};

export type FolderExtractErrorCode =
  | "invalid_archive"
  | "too_many_entries"
  | "too_large"
  | "unsafe_entry_path";

export class FolderExtractError extends Error {
  constructor(
    readonly code: FolderExtractErrorCode,
    message: string
  ) {
    super(message);
    this.name = "FolderExtractError";
  }
}

export type FolderExtractResult = {
  directoriesCreated: number;
  filesWritten: number;
  skippedEntryCount: number;
};

type FolderExtractPlanEntry = {
  /** Normalized canonical path, already checked to resolve inside the destination folder. */
  destPath: string;
  entry: IZipEntry;
};

type FolderExtractPlan = {
  entries: FolderExtractPlanEntry[];
  skippedEntryCount: number;
};

function isSkippedEntry(entryName: string): boolean {
  if (entryName.startsWith(SKIPPED_ENTRY_ROOT)) {
    return true;
  }
  const fileName = entryName.split("/").pop() ?? entryName;

  return SKIPPED_ENTRY_NAMES.has(fileName);
}

/**
 * Resolves an entry against the destination folder the same way storage will, and returns the
 * result only when it stays inside that folder.
 *
 * Checking the entry name on its own is not enough: `DustFileSystem.normalizeScopedPath` strips
 * control characters *before* normalizing, so `.\x01./x` reads as an ordinary relative name here
 * and as `../x` by the time it reaches storage. Resolving through the same normalization is what
 * makes the containment check match what actually gets written.
 */
function resolveContainedDestPath(
  normalizedDestFolder: string,
  relativePath: string
): string | null {
  if (path.posix.isAbsolute(relativePath)) {
    return null;
  }

  const resolved = DustFileSystem.normalizeScopedPath(
    `${normalizedDestFolder}/${relativePath}`
  );
  if (!resolved || !resolved.startsWith(`${normalizedDestFolder}/`)) {
    return null;
  }

  return resolved;
}

/**
 * Validates every entry before anything is written, so an archive that is rejected — for an entry
 * escaping the destination or for busting a limit — leaves the destination untouched rather than
 * half-populated. Skipped entries are validated and counted like any other: a junk name must not
 * buy an archive a free pass through either check.
 */
function planArchiveExtraction(
  zip: AdmZip,
  destFolderPath: string,
  limits: FolderExtractLimits
): Result<FolderExtractPlan, FolderExtractError> {
  const normalizedDestFolder =
    DustFileSystem.normalizeScopedPath(destFolderPath);
  if (!normalizedDestFolder) {
    return new Err(
      new FolderExtractError(
        "unsafe_entry_path",
        `Invalid destination folder: "${destFolderPath}".`
      )
    );
  }

  const entries: FolderExtractPlanEntry[] = [];
  let entryCount = 0;
  let skippedEntryCount = 0;
  let totalUncompressedSizeBytes = 0;

  for (const entry of zip.getEntries()) {
    const relativePath = entry.entryName.replace(/\/+$/, "");

    // Some tools emit an entry for the archive root itself; it names the destination folder,
    // which already exists.
    if (relativePath === "" || relativePath === ".") {
      skippedEntryCount += 1;
      continue;
    }

    const destPath = resolveContainedDestPath(
      normalizedDestFolder,
      relativePath
    );
    if (!destPath) {
      return new Err(
        new FolderExtractError(
          "unsafe_entry_path",
          `Archive entry points outside the destination folder: "${entry.entryName}".`
        )
      );
    }

    entryCount += 1;
    if (entryCount > limits.maxEntries) {
      return new Err(
        new FolderExtractError(
          "too_many_entries",
          `Archive contains more than ${limits.maxEntries} entries.`
        )
      );
    }

    totalUncompressedSizeBytes += entry.header.size;
    if (totalUncompressedSizeBytes > limits.maxUncompressedSizeBytes) {
      return new Err(
        new FolderExtractError(
          "too_large",
          `Archive expands to more than ${limits.maxUncompressedSizeBytes} bytes.`
        )
      );
    }

    if (isSkippedEntry(entry.entryName)) {
      skippedEntryCount += 1;
      continue;
    }

    entries.push({ destPath, entry });
  }

  return new Ok({ entries, skippedEntryCount });
}

/**
 * @cc [owner:davidebbo,label:product] extract-preserves-archive-layout
 * Archive entries are written verbatim under the destination folder, without adding or stripping a
 * root folder. An archive produced by `planFolderArchive` carries the downloaded folder as its own
 * root, so extracting it into that folder's PARENT recreates the folder rather than nesting or
 * flattening it. Extracting into the folder itself nests it one level deeper, which is what
 * verbatim placement means.
 */
/**
 * @cc [owner:davidebbo,label:security] extract-entry-path-containment
 * No entry may be written outside the destination folder. Containment MUST be decided on the entry
 * path resolved through the same normalization storage applies, not on the raw entry name, and MUST
 * be checked for every entry including ones that are otherwise skipped. An archive holding an entry
 * that escapes the destination MUST be rejected before any of its entries is written, so a rejected
 * archive never leaves entries behind.
 */
/**
 * @cc [owner:davidebbo,label:performance] extract-limits-enforced-before-writing
 * The entry count and total uncompressed size MUST be checked against `limits` before any entry is
 * written, counting every archive entry including skipped ones, so an archive over either limit
 * leaves the destination untouched.
 */
/**
 * Expands a ZIP archive into `destFolderPath`, the mirror image of
 * `planFolderArchive`/`streamFolderArchive`.
 */
export async function extractArchiveToFolder(
  fileSystem: DustFileSystem,
  destFolderPath: string,
  archive: Buffer,
  limits: FolderExtractLimits = DEFAULT_FOLDER_EXTRACT_LIMITS
): Promise<
  Result<FolderExtractResult, FolderExtractError | DustFileSystemError>
> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(archive);
  } catch (err) {
    return new Err(
      new FolderExtractError(
        "invalid_archive",
        `Failed to open the archive: ${normalizeError(err).message}`
      )
    );
  }

  const planResult = planArchiveExtraction(zip, destFolderPath, limits);
  if (planResult.isErr()) {
    return planResult;
  }
  const { entries, skippedEntryCount } = planResult.value;

  let directoriesCreated = 0;
  let filesWritten = 0;

  for (const { destPath, entry } of entries) {
    if (entry.isDirectory) {
      const mkdirResult = await fileSystem.mkdir(destPath);
      // Extracting into an existing tree re-declares directories that are already there.
      if (mkdirResult.isErr()) {
        if (!isDustFileSystemError(mkdirResult.error, "already_exists")) {
          return mkdirResult;
        }
        continue;
      }
      directoriesCreated += 1;
      continue;
    }

    const fileName = destPath.split("/").pop() ?? destPath;
    const writeResult = await fileSystem.write(
      destPath,
      entry.getData(),
      contentTypeFromFileName(fileName) ?? FALLBACK_CONTENT_TYPE
    );
    if (writeResult.isErr()) {
      return writeResult;
    }
    filesWritten += 1;
  }

  return new Ok({ directoriesCreated, filesWritten, skippedEntryCount });
}
