import { useNavigationLock } from "@app/hooks/useNavigationLock";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { useWriteFileContentByPath } from "@app/lib/swr/files";
import type { FilePreviewCategory } from "@app/types/file_preview";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import type { DocumentHandle, DocumentSaveResult } from "@dust-tt/sparkle";
import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

interface UseMarkdownFileEditorParams {
  category: FilePreviewCategory;
  entryPath: string | undefined;
  fileUrl: string | null;
  isActive: boolean;
  isContentLoading: boolean;
  isTooLarge: boolean;
  owner: LightWorkspaceType | undefined;
  processedContent: ProcessedContent | null;
  canEdit?: boolean;
}

export interface MarkdownFileEditor {
  canEdit: boolean;
  content: string | undefined;
  documentRef: RefObject<DocumentHandle>;
  documentKey: number;
  isDirty: boolean;
  isSaving: boolean;
  save: () => Promise<boolean>;
  saveContent: (content: string) => Promise<DocumentSaveResult>;
  setDocumentDirty: (dirty: boolean) => void;
}

interface DocumentFile {
  path: string | undefined;
  isActive: boolean;
  source: string | undefined;
}

interface DocumentSession extends DocumentFile {
  key: number;
  content: string | undefined;
}

const getDocumentSession = (
  current: DocumentSession,
  file: DocumentFile,
  canRefresh: boolean
): DocumentSession => {
  if (file.path !== current.path || file.isActive !== current.isActive) {
    return { ...file, key: current.key + 1, content: file.source };
  }
  if (
    !canRefresh ||
    file.source === undefined ||
    file.source === current.source
  ) {
    return current;
  }

  return {
    ...file,
    key: current.content === file.source ? current.key : current.key + 1,
    content: file.source,
  };
};

/**
 * @cc [owner:flvndvd,label:product] markdown-file-persistence
 * Rich edits MUST save plain Markdown to the canonical file through the Files API.
 * The save handle MUST await Document persistence and report failures to navigation guards.
 * Refreshes MUST preserve unsaved drafts and successful autosaves MUST NOT remount the editor.
 */
export const useMarkdownFileEditor = ({
  category,
  entryPath,
  fileUrl,
  isActive,
  isContentLoading,
  isTooLarge,
  owner,
  processedContent,
  canEdit: allowEditing = true,
}: UseMarkdownFileEditorParams): MarkdownFileEditor => {
  const source =
    isActive && entryPath && !isContentLoading
      ? processedContent?.text
      : undefined;
  const file = { path: entryPath, isActive, source };
  const [document, setDocument] = useState<DocumentSession>(() => ({
    ...file,
    key: 0,
    content: source,
  }));
  const [savingDocumentKey, setSavingDocumentKey] = useState<number | null>(
    null
  );
  const [isDirty, setDocumentDirty] = useState(false);
  const isSaving = savingDocumentKey === document.key;
  const sessionRef = useRef(document.key);
  const documentRef = useRef<DocumentHandle>(null);
  const writeContent = useWriteFileContentByPath({ owner });
  const { mutate } = useSWRConfig();

  const editablePath =
    entryPath && owner && parseCanonicalScopedPath(entryPath)
      ? entryPath
      : null;
  const canEdit =
    allowEditing && category === "markdown" && !!editablePath && !isTooLarge;
  const canEditRef = useRef(canEdit);

  useNavigationLock(isActive && (isDirty || isSaving));

  useLayoutEffect(() => {
    sessionRef.current = document.key;
    canEditRef.current = canEdit;
  }, [document.key, canEdit]);

  const canRefresh = !isDirty && !isSaving;
  const nextDocument = getDocumentSession(document, file, canRefresh);

  if (nextDocument !== document) {
    setDocument((current) => getDocumentSession(current, file, canRefresh));
    if (nextDocument.key !== document.key) {
      setDocumentDirty(false);
    }
  }

  const saveContent = async (markdown: string): Promise<DocumentSaveResult> => {
    if (
      !canEditRef.current ||
      !editablePath ||
      !isActive ||
      sessionRef.current !== document.key
    ) {
      return { ok: false, error: "This file is read-only." };
    }

    setSavingDocumentKey(document.key);
    try {
      const result = await writeContent({
        canonicalPath: editablePath,
        content: markdown,
        contentType: "text/markdown",
      });

      if (result.isErr()) {
        return { ok: false, error: result.error.message };
      }

      await mutate(
        fileUrl,
        { kind: "loaded", content: markdown },
        { revalidate: false }
      );

      setDocument((current) =>
        current.key === document.key
          ? { ...current, content: markdown }
          : current
      );

      return { ok: true };
    } finally {
      setSavingDocumentKey((current) =>
        current === document.key ? null : current
      );
    }
  };

  const save = async (): Promise<boolean> => {
    if (!isDirty && !isSaving) {
      return true;
    }

    const result = await documentRef.current?.save();
    return result?.ok ?? false;
  };

  return {
    canEdit,
    content: document.content,
    documentRef,
    documentKey: document.key,
    isDirty,
    isSaving,
    save,
    saveContent,
    setDocumentDirty,
  };
};
