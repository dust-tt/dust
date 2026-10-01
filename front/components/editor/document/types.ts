// Shared by Document and its hook to avoid circular type imports.
export type DocumentSaveResult = { ok: true } | { ok: false; error: string };

export interface DocumentProps {
  /** The DFM source of the file. Remount with a new key to open another document. */
  initialContent: string;
  /** Classes for the outer container. */
  className?: string;
  /** Optional container for formatting tooltips. Defaults to the enclosing sheet or body. */
  mountPortalContainer?: HTMLElement;
  readOnly?: boolean;
  /** Idle time before autosaving, in milliseconds. Defaults to 3,000. */
  autosaveDebounceMs?: number;
  /** Enables editing. Receives the DFM source to persist; resolve { ok: true } once stored. */
  onSave?: (content: string) => Promise<DocumentSaveResult>;
}
