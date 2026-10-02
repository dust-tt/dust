// Shared by Document and its hook to avoid circular type imports.
import type { Result } from "@app/types/shared/result";

/** Ok once the content is stored, Err with a message the editor shows next to Retry. */
export type DocumentSaveResult = Result<void, string>;

export interface DocumentProps {
  /** Starting content. Remount with a new key to open another document. */
  initialContent: string;
  contentType?: "markdown" | "json";
  /** Format passed to onSave. Defaults to JSON, independently of contentType. */
  saveFormat?: "markdown" | "json";
  /** Classes for the outer container. */
  className?: string;
  /** Optional container for formatting tooltips. Defaults to the enclosing sheet or body. */
  mountPortalContainer?: HTMLElement;
  readOnly?: boolean;
  /** Idle time before autosaving, in milliseconds. Defaults to 3,000. */
  autosaveDebounceMs?: number;
  /** Enables editing. Persist the content and resolve Ok, or Err with the reason. */
  onSave?: (content: string) => Promise<DocumentSaveResult>;
}
