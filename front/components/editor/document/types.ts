// Shared by Document and its hook to avoid circular type imports.
import type { Result } from "@app/types/shared/result";

/** Ok once the content is stored, Err with a message the editor shows next to Retry. */
export type DocumentSaveResult = Result<void, string>;

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
  /** Enables editing. Receives the DFM source to persist; resolve Ok once stored, Err with the reason. */
  onSave?: (content: string) => Promise<DocumentSaveResult>;
  /** Reports the draft state, so the host can hold navigation while edits are unsaved. */
  onStateChange?: (state: DocumentDraftState) => void;
}

export interface DocumentDraftState {
  dirty: boolean;
  saving: boolean;
  /** The last save failure shown to the user, or null. */
  error: string | null;
}
