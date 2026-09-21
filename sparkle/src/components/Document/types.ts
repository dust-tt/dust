export type DocumentSaveResult = { ok: true } | { ok: false; error: string };

/**
 * A document editor with fixed typography, slash commands, and selection-only formatting.
 * Accepts Markdown or saved JSON and autosaves serialized JSON through the host callback.
 * Hosts own storage and authorization; omitting onSave renders a read-only document.
 */
export interface DocumentProps {
  /** Already stored content. Remount with a new key to open another document. */
  initialContent: string;
  contentType?: "markdown" | "json";
  /** Classes for the outer container, for layout and surface styling. */
  className?: string;
  readOnly?: boolean;
  /** Idle time before autosaving, in milliseconds. Defaults to 3,000. */
  autosaveDebounceMs?: number;
  /** Receives an opaque serialized document; resolve only after persistence succeeds. */
  onSave?: (contentJson: string) => Promise<DocumentSaveResult>;
}
