import path from "node:path";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { DustFileSystemError } from "@app/types/file_system";
import { isDustFileSystemError } from "@app/types/file_system";
import { contentTypeFromFileName } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { IZipEntry } from "adm-zip";
import AdmZip from "adm-zip";

export type FolderExtractFileSystem = Pick<DustFileSystem, "mkdir" | "write">;

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

// The archive is buffered in memory, so the uncompressed cap sits well below the 1 GB a folder
// download allows (see DEFAULT_FOLDER_ARCHIVE_LIMITS): a folder that can be downloaded is not
// necessarily one that can be uploaded back.
export const DEFAULT_FOLDER_EXTRACT_LIMITS: FolderExtractLimits = {
  maxEntries: 5_000,
  maxUncompressedSizeBytes: 100 * 1024 * 1024,
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

export function isFolderExtractError(
  error: unknown,
  code?: FolderExtractErrorCode
): error is FolderExtractError {
  return error instanceof FolderExtractError && (!code || error.code === code);
}

export type FolderExtractResult = {
  directoriesCreated: number;
  filesWritten: number;
  skippedEntryCount: number;
};

type FolderExtractPlanEntry = {
  /** Path relative to the destination folder, already checked to stay inside it. */
  relativePath: string;
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
 * Validates every entry before anything is written, so an archive that is rejected — for a
 * traversing path or for busting a limit — leaves the destination untouched rather than
 * half-populated.
 */
function planArchiveExtraction(
  zip: AdmZip,
  limits: FolderExtractLimits
): Result<FolderExtractPlan, FolderExtractError> {
  const entries: FolderExtractPlanEntry[] = [];
  let skippedEntryCount = 0;
  let totalUncompressedSizeBytes = 0;

  for (const entry of zip.getEntries()) {
    if (isSkippedEntry(entry.entryName)) {
      skippedEntryCount += 1;
      continue;
    }

    const relativePath = entry.entryName.replace(/\/+$/, "");
    // `dustFs.write` would reject a traversing path at the mount boundary anyway; rejecting it
    // here keeps the failure specific and stops the archive before its safe entries land.
    if (
      path.posix.isAbsolute(relativePath) ||
      path.posix.normalize(relativePath).startsWith("..")
    ) {
      return new Err(
        new FolderExtractError(
          "unsafe_entry_path",
          `Archive entry points outside the destination folder: "${entry.entryName}".`
        )
      );
    }

    entries.push({ relativePath, entry });

    if (entries.length > limits.maxEntries) {
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
  }

  return new Ok({ entries, skippedEntryCount });
}

/**
 * @cc [owner:davidebbo,label:product] extract-preserves-archive-layout
 * Archive entries are written verbatim under the destination folder, without adding or stripping a
 * root folder. An archive produced by `planFolderArchive` carries the downloaded folder as its own
 * root, so extracting it into the folder it came from recreates that folder rather than nesting or
 * flattening it.
 */
/**
 * @cc [owner:davidebbo,label:security] extract-entry-path-containment
 * No entry may be written outside the destination folder. An archive holding an absolute or
 * traversing entry path MUST be rejected before any of its entries is written, so a rejected
 * archive never leaves entries behind.
 */
/**
 * @cc [owner:davidebbo,label:performance] extract-limits-enforced-before-writing
 * The entry count and total uncompressed size MUST be checked against `limits` before any entry is
 * written, so an archive over either limit leaves the destination untouched.
 */
/**
 * Expands a ZIP archive into `destFolderPath`, the mirror image of
 * `planFolderArchive`/`streamFolderArchive`.
 */
export async function extractArchiveToFolder(
  fileSystem: FolderExtractFileSystem,
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

  const planResult = planArchiveExtraction(zip, limits);
  if (planResult.isErr()) {
    return planResult;
  }
  const { entries, skippedEntryCount } = planResult.value;

  let directoriesCreated = 0;
  let filesWritten = 0;

  for (const { relativePath, entry } of entries) {
    const destPath = `${destFolderPath}/${relativePath}`;

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

    const fileName = relativePath.split("/").pop() ?? relativePath;
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
