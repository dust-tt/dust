import type { DustFileSystem } from "@app/lib/api/file_system";
import type {
  FileSystemEntry,
  FileSystemFileEntry,
} from "@app/lib/api/file_system/types";
import { enrichListWithFileResourceIds } from "@app/lib/api/files/file_system_ops";
import { parseProcessedFilename } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import {
  isInteractiveContentType,
  stripMimeParameters,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import partition from "lodash/partition";

function getDirAndFileName(path: string): { dir: string; fileName: string } {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash < 0) {
    return { dir: "", fileName: path };
  }

  return {
    dir: path.substring(0, lastSlash),
    fileName: path.substring(lastSlash + 1),
  };
}

export async function formatFileListOutput(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPrefix: string
): Promise<Result<string, Error>> {
  const listResult = await dustFs.list(scopedPrefix, {
    includeProcessed: true,
  });
  if (listResult.isErr()) {
    return listResult;
  }

  const entries = await enrichListWithFileResourceIds(
    auth,
    dustFs,
    listResult.value
  );

  const [dirs, rawFiles] = partition(entries, (e) => e.isDirectory);
  const files = rawFiles.filter(
    (e): e is FileSystemFileEntry => !e.isDirectory
  );

  if (dirs.length === 0 && files.length === 0) {
    return new Ok("No files available.");
  }

  return new Ok(formatFileEntries(dirs, files));
}

function formatFileEntries(
  dirs: FileSystemEntry[],
  files: FileSystemFileEntry[]
): string {
  const nonEmptyDirPaths = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length - 1; i++) {
      nonEmptyDirPaths.add(parts.slice(0, i + 1).join("/"));
    }
  }

  const sourcePathByKey = new Map<string, string>();
  for (const file of files) {
    const { dir, fileName } = getDirAndFileName(file.path);
    if (parseProcessedFilename(fileName).isProcessed) {
      continue;
    }
    const lastDot = fileName.lastIndexOf(".");
    const base = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
    sourcePathByKey.set(`${dir}/${base}`, file.path);
  }

  const annotated = files.map((file) => {
    const { dir, fileName } = getDirAndFileName(file.path);
    const parsed = parseProcessedFilename(fileName);
    if (!parsed.isProcessed) {
      return { file, sortKey: file.path, tieBreak: 0, sourcePath: null };
    }

    const sourcePath =
      sourcePathByKey.get(`${dir}/${parsed.sourceBaseName}`) ?? null;

    return {
      file,
      sortKey: sourcePath ?? file.path,
      tieBreak: sourcePath ? 1 : 0,
      sourcePath,
    };
  });

  annotated.sort(
    (a, b) => a.sortKey.localeCompare(b.sortKey) || a.tieBreak - b.tieBreak
  );

  const lines: string[] = [];

  for (const dir of dirs) {
    if (!nonEmptyDirPaths.has(dir.path)) {
      lines.push(`${dir.path}/ [empty directory]`);
    }
  }

  for (const { file, sourcePath } of annotated) {
    const mimeType = stripMimeParameters(file.contentType);
    const kb = Math.ceil(file.sizeBytes / 1024);
    const annotation = sourcePath
      ? ` (processed version of ${sourcePath})`
      : "";
    const fileIdSuffix =
      isInteractiveContentType(mimeType) && file.fileId
        ? ` [id: ${file.fileId}]`
        : "";
    lines.push(
      `${file.path} (${mimeType}, ${kb} KB)${fileIdSuffix}${annotation}`
    );
  }

  return lines.join("\n");
}
