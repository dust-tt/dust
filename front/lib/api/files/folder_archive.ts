import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { DustFileSystemError } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createReadableCancellationHandler } from "@app/types/shared/utils/streams";
import { ZipArchive } from "archiver";

const DIRECTORY_CONTENT_TYPE = "application/x-directory";
// One slot permits a backend root-directory placeholder; the other detects one entry over limit.
const FOLDER_ARCHIVE_LIST_EXTRA_ENTRIES = 2;

export const DEFAULT_FOLDER_ARCHIVE_LIMITS: FolderArchiveLimits = {
  maxEntries: 5_000,
  maxSizeBytes: 1024 * 1024 * 1024,
};

export type FolderArchiveLimits = {
  maxEntries: number;
  maxSizeBytes: number;
};

export type FolderArchiveFile = {
  archivePath: string;
  canonicalPath: string;
};

export type FolderArchivePlan = {
  archiveFileName: string;
  directories: string[];
  files: FolderArchiveFile[];
};

export type FolderArchiveErrorCode =
  | "not_found"
  | "not_directory"
  | "too_many_entries"
  | "too_large"
  | "internal";

export class FolderArchiveError extends Error {
  constructor(
    readonly code: FolderArchiveErrorCode,
    message: string
  ) {
    super(message);
    this.name = "FolderArchiveError";
  }
}

export function isFolderArchiveError(
  error: unknown
): error is FolderArchiveError {
  return error instanceof FolderArchiveError;
}

export type FolderArchiveFileSystem = Pick<
  DustFileSystem,
  "getMounts" | "list" | "read" | "stat"
>;

export type FolderArchivePlanError = DustFileSystemError | FolderArchiveError;

/**
 * @cc [owner:davidebbo,label:product] mounted-root-is-downloadable
 * A readable conversation or pod mount root is a valid archive target even when it has no stat
 * result or listed children.
 */
export async function planFolderArchive(
  fileSystem: FolderArchiveFileSystem,
  canonicalFolderPath: string,
  limits: FolderArchiveLimits = DEFAULT_FOLDER_ARCHIVE_LIMITS
): Promise<Result<FolderArchivePlan, FolderArchivePlanError>> {
  const normalizedFolderPath = canonicalFolderPath.replace(/\/+$/, "");
  const rootName = path.posix.basename(normalizedFolderPath);
  if (!normalizedFolderPath || !rootName) {
    return new Err(new FolderArchiveError("not_found", "Folder not found."));
  }

  const statResult = await fileSystem.stat(normalizedFolderPath);
  if (statResult.isErr()) {
    return new Err(statResult.error);
  }
  if (
    statResult.value &&
    statResult.value.contentType !== DIRECTORY_CONTENT_TYPE
  ) {
    return new Err(
      new FolderArchiveError(
        "not_directory",
        "Only folders can be downloaded as ZIP archives."
      )
    );
  }

  const listResult = await fileSystem.list(normalizedFolderPath, {
    maxFiles: limits.maxEntries + FOLDER_ARCHIVE_LIST_EXTRA_ENTRIES,
  });
  if (listResult.isErr()) {
    return new Err(listResult.error);
  }

  const isMountRoot = fileSystem
    .getMounts()
    .some((mount) => mount.scopedPrefix === normalizedFolderPath);
  if (!statResult.value && listResult.value.length === 0 && !isMountRoot) {
    return new Err(new FolderArchiveError("not_found", "Folder not found."));
  }

  const entries = listResult.value.filter(
    (entry) => entry.path !== normalizedFolderPath
  );
  if (entries.length > limits.maxEntries) {
    return new Err(
      new FolderArchiveError(
        "too_many_entries",
        `Folder contains more than ${limits.maxEntries} downloadable entries.`
      )
    );
  }

  const directories = new Set<string>([`${rootName}/`]);
  const files: FolderArchiveFile[] = [];
  let totalSizeBytes = 0;
  const entryPathPrefix = `${normalizedFolderPath}/`;

  for (const entry of entries) {
    if (!entry.path.startsWith(entryPathPrefix)) {
      return new Err(
        new FolderArchiveError(
          "internal",
          `Listed path is outside the archived folder: ${entry.path}`
        )
      );
    }
    const archivePath = path.posix.join(
      rootName,
      entry.path.slice(entryPathPrefix.length)
    );

    if (entry.isDirectory) {
      directories.add(`${archivePath.replace(/\/+$/, "")}/`);
      continue;
    }

    if (!Number.isFinite(entry.sizeBytes) || entry.sizeBytes < 0) {
      return new Err(
        new FolderArchiveError(
          "internal",
          `File has an invalid size: ${entry.path}`
        )
      );
    }

    totalSizeBytes += entry.sizeBytes;
    if (totalSizeBytes > limits.maxSizeBytes) {
      return new Err(
        new FolderArchiveError(
          "too_large",
          `Folder exceeds the ${limits.maxSizeBytes} byte download limit.`
        )
      );
    }

    files.push({
      archivePath,
      canonicalPath: entry.path,
    });
  }

  return new Ok({
    archiveFileName: `${rootName}.zip`,
    directories: [...directories].sort(),
    files: files.sort((a, b) => a.archivePath.localeCompare(b.archivePath)),
  });
}

/**
 * @cc [owner:davidebbo,label:performance] archive-stream-backpressure
 * The returned Web stream must propagate consumer backpressure to the ZIP output.
 */
/**
 * @cc [owner:davidebbo,label:error-handling] archive-stream-cancellation
 * Cancelling the returned Web stream must abort the archive and stop both active and subsequently
 * resolved file-source streams without destroying a source before its first `pipe` event.
 */
export function streamFolderArchive(
  fileSystem: FolderArchiveFileSystem,
  plan: FolderArchivePlan
): ReadableStream {
  const output = new PassThrough();
  // Node's stream/web declarations and TypeScript's DOM declarations describe the same runtime
  // Web stream but currently disagree on BYOB generic constraints.
  const webOutput = Readable.toWeb(output) as ReadableStream;
  const archive = new ZipArchive({ zlib: { level: 6 } });
  let cancelActiveReadStream: (() => void) | null = null;
  let failed = false;

  const fail = (error: unknown) => {
    if (failed) {
      return;
    }
    failed = true;
    cancelActiveReadStream?.();
    void archive.abort();
    output.destroy(normalizeError(error));
  };

  archive.on("warning", fail);
  archive.on("error", fail);
  archive.pipe(output);

  output.on("close", () => {
    if (!output.readableEnded) {
      fail(new Error("Folder archive download was interrupted."));
    }
  });

  const writeArchive = async () => {
    for (const directory of plan.directories) {
      archive.append(Buffer.alloc(0), { name: directory });
    }

    for (const file of plan.files) {
      const readResult = await fileSystem.read(file.canonicalPath);
      if (readResult.isErr()) {
        fail(readResult.error);
        return;
      }
      if (!readResult.value) {
        fail(
          new FolderArchiveError(
            "not_found",
            `File disappeared while creating the archive: ${file.canonicalPath}`
          )
        );
        return;
      }

      const readStream = readResult.value;
      const cancelReadStream = createReadableCancellationHandler(readStream);
      if (failed) {
        cancelReadStream();
        return;
      }

      cancelActiveReadStream = cancelReadStream;
      try {
        const streamFinished = finished(readStream, { cleanup: true });
        archive.append(readStream, { name: file.archivePath });
        await streamFinished;
      } finally {
        cancelActiveReadStream = null;
      }

      if (failed) {
        return;
      }
    }

    await archive.finalize();
  };

  void writeArchive().catch(fail);
  return webOutput;
}
