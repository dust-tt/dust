// Shared by Document and its hook to avoid circular type imports.
export type DocumentSaveResult = { ok: true } | { ok: false; error: string };

export interface DocumentProps {
  /** Starting content. Remount with a new key to open another document. */
  initialContent: string;
  contentType?: "markdown" | "json";
  /** Format passed to onSave. Defaults to JSON, independently of contentType. */
  saveFormat?: "markdown" | "json";
  /** Classes for the outer container. */
  className?: string;
  readOnly?: boolean;
  /** Idle time before autosaving, in milliseconds. Defaults to 3,000. */
  autosaveDebounceMs?: number;
  /** Enables editing. Persist the selected save format before returning { ok: true }. */
  onSave?: (content: string) => Promise<DocumentSaveResult>;
}
