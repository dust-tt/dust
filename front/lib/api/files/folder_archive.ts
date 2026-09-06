import path from "node:path";
import type { Readable } from "node:stream";
import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { FileSystemEntry } from "@app/types/api/file_system/types";
import type { DustFileSystemError } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { ZipArchive } from "archiver";

const DIRECTORY_CONTENT_TYPE = "application/x-directory";

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
  sizeBytes: number;
};

export type FolderArchivePlan = {
  archiveFileName: string;
  directories: string[];
  files: FolderArchiveFile[];
  totalSizeBytes: number;
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

function archivePathForEntry({
  canonicalFolderPath,
  entry,
  rootName,
}: {
  canonicalFolderPath: string;
  entry: FileSystemEntry;
  rootName: string;
}): Result<string | null, FolderArchiveError> {
  if (entry.path === canonicalFolderPath) {
    return new Ok(null);
  }

  const prefix = `${canonicalFolderPath}/`;
  if (!entry.path.startsWith(prefix)) {
    return new Err(
      new FolderArchiveError(
        "internal",
        `Listed path is outside the archived folder: ${entry.path}`
      )
    );
  }

  return new Ok(path.posix.join(rootName, entry.path.slice(prefix.length)));
}

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
    maxFiles: limits.maxEntries + 2,
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

  for (const entry of entries) {
    const archivePathResult = archivePathForEntry({
      canonicalFolderPath: normalizedFolderPath,
      entry,
      rootName,
    });
    if (archivePathResult.isErr()) {
      return archivePathResult;
    }
    const archivePath = archivePathResult.value;
    if (!archivePath) {
      continue;
    }

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
      sizeBytes: entry.sizeBytes,
    });
  }

  return new Ok({
    archiveFileName: `${rootName}.zip`,
    directories: [...directories].sort(),
    files: files.sort((a, b) => a.archivePath.localeCompare(b.archivePath)),
    totalSizeBytes,
  });
}

export function streamFolderArchive(
  fileSystem: FolderArchiveFileSystem,
  plan: FolderArchivePlan
): Readable {
  const output = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  let activeReadStream: Readable | null = null;
  let failed = false;

  const fail = (error: unknown) => {
    if (failed) {
      return;
    }
    failed = true;
    activeReadStream?.destroy();
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

      activeReadStream = readResult.value;
      const streamFinished = finished(activeReadStream, { cleanup: true });
      archive.append(activeReadStream, { name: file.archivePath });
      await streamFinished;
      activeReadStream = null;
    }

    await archive.finalize();
  };

  void writeArchive().catch(fail);
  return output;
}
