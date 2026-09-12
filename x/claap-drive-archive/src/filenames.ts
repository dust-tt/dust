import type { ClaapRecording } from "./types.ts";

const MAX_TITLE_LENGTH = 80;

export function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned.length > 0 ? cleaned : "untitled";
}

export function recorderFolderName(recording: ClaapRecording): string {
  const email = recording.recorder.email?.trim().toLowerCase();
  if (!email) {
    return "_unknown";
  }
  return sanitizeFilenamePart(email);
}

export function archiveDatePrefix(createdAt: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(createdAt);
  if (match) {
    return match[1];
  }
  return new Date(createdAt).toISOString().slice(0, 10);
}

export function archiveBaseName(recording: ClaapRecording): string {
  const date = archiveDatePrefix(recording.createdAt);
  const title = sanitizeFilenamePart(recording.title ?? "untitled").slice(
    0,
    MAX_TITLE_LENGTH
  );
  return `${date}_${title}_${recording.id}`;
}

export function videoExtension(mimeType: string): string {
  if (mimeType.includes("quicktime") || mimeType.includes("mp4")) {
    return "mp4";
  }
  if (mimeType.includes("webm")) {
    return "webm";
  }
  if (mimeType.includes("mpeg")) {
    return "mpeg";
  }
  return "mp4";
}
