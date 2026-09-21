// Shared by Document and its hook to avoid circular type imports.
export type DocumentSaveResult = { ok: true } | { ok: false; error: string };

export interface DocumentProps {
  /** Starting content. Remount with a new key to open another document. */
  initialContent: string;
  contentType?: "markdown" | "json";
  /** Classes for the outer container. */
  className?: string;
  readOnly?: boolean;
  /** Idle time before autosaving, in milliseconds. Defaults to 3,000. */
  autosaveDebounceMs?: number;
  /** Enables editing. Persist serialized JSON before returning { ok: true }. */
  onSave?: (contentJson: string) => Promise<DocumentSaveResult>;
}
