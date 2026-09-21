import type { DocumentHandle, DocumentSaveResult } from "@dust-tt/sparkle";
import { Document } from "@dust-tt/sparkle";
import type { RefObject } from "react";

interface MarkdownFilePreviewProps {
  content: string;
  canEdit?: boolean;
  documentRef?: RefObject<DocumentHandle>;
  documentKey?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onSave?: (content: string) => Promise<DocumentSaveResult>;
}

/**
 * @cc [owner:flvndvd,label:product] markdown-file-editor
 * Writable Markdown MUST open directly in Document with autosave and no mode picker.
 * Read-only files MUST disable editing and persistence through Document's permissions.
 */
export const MarkdownFilePreview = ({
  content,
  canEdit = false,
  documentRef,
  documentKey,
  onDirtyChange,
  onSave,
}: MarkdownFilePreviewProps) => (
  <div className="h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg bg-background">
    <Document
      key={documentKey ?? content}
      ref={documentRef}
      initialContent={content}
      saveFormat="markdown"
      fullWidth
      readOnly={!canEdit}
      onSave={canEdit ? onSave : undefined}
      onDirtyChange={onDirtyChange}
    />
  </div>
);
