import { isSafeFrameRelativePath } from "@app/types/api/frame_manifest";
import { isAgentScopedPath } from "@app/types/mount_path";

const FILE_ID_REGEX = /^fil_[a-zA-Z0-9]{10,}$/;

/**
 * Browser-safe posix helpers. This module is imported from client code
 * (`VisualizationActionIframe`); do not use `node:path` or `typescript`.
 */
function posixExtname(filePath: string): string {
  const base = filePath.slice(filePath.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  // Match path.posix.extname: no extension for "foo", "foo.", or ".hidden".
  if (dot <= 0) {
    return "";
  }
  return base.slice(dot);
}

/**
 * Extensions we treat as Frame package assets loadable via useFile (not UI modules).
 * Source of truth for formats is `FILE_FORMATS` / `contentTypeFromFileName` in
 * `front/types/files.ts`; this is the non-`code` asset subset used for extraction.
 */
const FRAME_PACKAGE_ASSET_EXTENSIONS = new Set([
  ".csv",
  ".tsv",
  ".json",
  ".dustdoc",
  ".txt",
  ".md",
  ".markdown",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".xml",
  ".yaml",
  ".yml",
  ".html",
  ".htm",
  ".css",
  ".mp3",
  ".mp4",
  ".wav",
  ".webm",
]);

function hasFramePackageAssetExtension(relativePath: string): boolean {
  const ext = posixExtname(relativePath).toLowerCase();
  // Reject empty, trailing-dot (`foo.` → `.`), and junk like `.tsx:116:6`.
  if (!ext || ext === "." || ext.includes(":") || ext.includes(" ")) {
    return false;
  }
  return FRAME_PACKAGE_ASSET_EXTENSIONS.has(ext);
}

/**
 * Canonical portable package-relative form used by useFile, extraction, and allowlist:
 * `./data.csv`, `./assets/logo.png`.
 */
export function formatFramePackageRelativePath(relativePath: string): string {
  const trimmed = relativePath.trim();
  const withoutDot = trimmed.startsWith("./") ? trimmed.slice(2) : trimmed;
  return `./${withoutDot}`;
}

/**
 * True when `value` is a Frame-package-relative path (not a file id or scoped mount path).
 * Accepts `./data.csv` and bare `data.csv` at runtime so pre-publish authoring still works.
 */
export function isFramePackageRelativePath(value: string): boolean {
  if (value.length === 0 || isAgentScopedPath(value)) {
    return false;
  }

  const trimmed = value.trim();
  // Reject both valid fil_* ids and incomplete fil_ prefixes.
  if (trimmed.startsWith("fil_") || FILE_ID_REGEX.test(trimmed)) {
    return false;
  }
  // Reject scoped-looking prefixes even when the id is empty / invalid
  // (`conversation-/file.csv`), so they are not treated as package-relative.
  if (/^(conversation|pod|project)[-/]/.test(trimmed)) {
    return false;
  }

  const withoutDot = trimmed.startsWith("./") ? trimmed.slice(2) : trimmed;
  return isSafeFrameRelativePath(withoutDot);
}

/** Strip optional `./` and return the safe package-relative path, or null. */
export function parseFramePackageRelativePath(value: string): string | null {
  if (!isFramePackageRelativePath(value)) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.startsWith("./") ? trimmed.slice(2) : trimmed;
}

/**
 * Extraction rule: only the `./asset.ext` form. Publish rewrite emits this; bare paths and
 * UI copy / source-location strings are ignored.
 */
export function parseExtractableFramePackageRelativePath(
  value: string
): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("./")) {
    return null;
  }

  const relativePath = parseFramePackageRelativePath(trimmed);
  if (!relativePath || !hasFramePackageAssetExtension(relativePath)) {
    return null;
  }

  return relativePath;
}

/**
 * Join a package-relative path onto the Frame source root. Rejects escape / unsafe paths.
 */
export function resolvePackageRelativeToScopedPath({
  relativePath,
  frameRoot,
}: {
  relativePath: string;
  frameRoot: string;
}): string | null {
  const parsed = parseFramePackageRelativePath(
    relativePath.startsWith("./") ? relativePath : `./${relativePath}`
  );
  if (!parsed) {
    return null;
  }

  const root = frameRoot.replace(/\/+$/, "");
  if (!root.includes("/")) {
    return null;
  }

  // `parsed` is already constrained by isSafeFrameRelativePath (no `.` / `..` /
  // empty segments), so a plain join is sufficient and stays browser-safe.
  const joined = `${root}/${parsed}`;
  if (joined !== root && !joined.startsWith(`${root}/`)) {
    return null;
  }

  return joined;
}
