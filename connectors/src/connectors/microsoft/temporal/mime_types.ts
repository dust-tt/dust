import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";

export async function getMimeTypesToSync({
  pdfEnabled,
  csvEnabled,
}: {
  pdfEnabled: boolean;
  csvEnabled: boolean;
}) {
  const mimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  if (pdfEnabled) {
    mimeTypes.push("application/pdf");
  }
  if (csvEnabled) {
    mimeTypes.push("application/vnd.ms-excel"); // Microsoft type for "text/csv"
    mimeTypes.push("text/csv");
  }

  return mimeTypes;
}

// SharePoint sometimes exposes plain-text files (e.g. legacy source code) with a
// per-file content-type of "application/octet-stream" — the generic binary default —
// instead of "text/plain". Those files would otherwise be silently skipped by the
// mime-type gate. For a small set of known text extensions we treat such files as
// text so they get synced. Binary files that happen to carry a text extension are
// still rejected downstream by the letter-ratio heuristic in `handleTextFile`.
const TEXT_EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
};

const OCTET_STREAM_MIME_TYPE = "application/octet-stream";

/**
 * @cc [owner:tdraier,label:backend] octet-stream-text-extension-fallback
 * The extension fallback MUST apply only when `item.file.mimeType` is exactly
 * "application/octet-stream": in that case, if `item.name` ends with a known text
 * extension (`.txt`, `.md`, `.markdown`), the returned mime type MUST be the mapped
 * text type (`text/plain`/`text/markdown`). For any other raw mime type — including
 * a missing (`null`/`undefined`) one — the raw `item.file.mimeType` MUST be returned
 * unchanged (returning `undefined` when it is absent), regardless of the extension.
 * This resolver MUST be used by every mime-type sync gate (pre-filter and per-file),
 * so a file's accept/skip decision and its downstream handler routing agree.
 */
export function resolveMicrosoftMimeType(item: DriveItem): string | undefined {
  const rawMimeType = item.file?.mimeType ?? undefined;
  if (rawMimeType !== OCTET_STREAM_MIME_TYPE) {
    return rawMimeType;
  }

  const name = item.name?.toLowerCase();
  if (name) {
    const ext = Object.keys(TEXT_EXTENSION_TO_MIME_TYPE).find((e) =>
      name.endsWith(e)
    );
    if (ext) {
      return TEXT_EXTENSION_TO_MIME_TYPE[ext];
    }
  }

  return rawMimeType;
}
