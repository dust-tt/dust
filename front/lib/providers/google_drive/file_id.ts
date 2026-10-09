const FILE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
// Captures the file or folder ID of any docs/drive URL: /d/<id>, /folders/<id>
// or ?id=<id>, whatever comes before (/document/, /file/, /u/0/, ...).
const DRIVE_URL_ID_REGEX =
  /^https?:\/\/(?:docs|drive)\.google\.com\/\S*?(?:\/(?:d|folders)\/|[?&]id=)([a-zA-Z0-9_-]+)/;

/**
 * Extracts a Google Drive file (or folder) ID from a bare ID or a
 * docs.google.com / drive.google.com URL. Returns null when the input is
 * neither.
 */
export function extractGoogleDriveFileId(input: string): string | null {
  const trimmedInput = input.trim();
  if (FILE_ID_REGEX.test(trimmedInput)) {
    return trimmedInput;
  }
  return trimmedInput.match(DRIVE_URL_ID_REGEX)?.[1] ?? null;
}
