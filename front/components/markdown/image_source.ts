import { FILE_ID_REGEX } from "@app/lib/files";
import { getFilePathViewUrl, getFileProcessedUrl } from "@app/lib/swr/files";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";

export type MarkdownImageSource =
  | { kind: "file_id"; fileId: string; url: string }
  | { kind: "file_path"; filePath: string; url: string };

const resolveFilePath = (src: string): string | null => {
  let filePath: string;
  try {
    filePath = decodeURIComponent(src);
  } catch {
    return null;
  }
  if (
    !parseCanonicalScopedPath(filePath)?.relPath ||
    filePath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  return filePath;
};

/**
 * @cc [owner:tdraier,label:security] markdown-image-file-api-only
 * A Markdown image destination MUST resolve only to a file API URL, so the file API checks the
 * reader's access: a file path in a conversation or a pod, percent-decoded, to its path URL, and
 * otherwise a destination holding exactly one file id to that file's processed URL, built from the
 * id alone. Any other source, such as an external URL or a path with `.` or `..` segments, MUST
 * resolve to null.
 */
export function resolveMarkdownImageSource(
  owner: LightWorkspaceType,
  src: string
): MarkdownImageSource | null {
  const filePath = resolveFilePath(src);
  if (filePath) {
    return {
      kind: "file_path",
      filePath,
      url: getFilePathViewUrl(owner, filePath),
    };
  }
  const fileIds = src.match(FILE_ID_REGEX);
  if (fileIds?.length === 1) {
    return {
      kind: "file_id",
      fileId: fileIds[0],
      url: getFileProcessedUrl(owner, fileIds[0]),
    };
  }
  return null;
}
