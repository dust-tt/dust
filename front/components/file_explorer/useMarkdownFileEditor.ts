import { useNavigationLock } from "@app/hooks/useNavigationLock";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { useWriteFileContentByPath } from "@app/lib/swr/files";
import type { FilePreviewCategory } from "@app/types/file_preview";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import type { DocumentHandle, DocumentSaveResult } from "@dust-tt/sparkle";
import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const [content, setContent] = useState("");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setDocumentDirty] = useState(false);
  const [documentKey, setDocumentKey] = useState(0);
  const [session, setSession] = useState({ isActive, path: entryPath });
  const sessionRef = useRef(session);
  const initKeyRef = useRef<string | null>(null);
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
    sessionRef.current = session;
    canEditRef.current = canEdit;
  }, [session, canEdit]);

  if (isActive !== session.isActive || entryPath !== session.path) {
    setSession({ isActive, path: entryPath });
    setSourcePath(null);
    setContent("");
    setDocumentDirty(false);
    setDocumentKey(documentKey + 1);
    setIsSaving(false);
    initKeyRef.current = null;
  }

  useEffect(() => {
    if (!isActive || !entryPath || isContentLoading || !processedContent) {
      return;
    }

    const initKey = `${entryPath}:${processedContent.text}`;
    if (initKeyRef.current === initKey || isDirty || isSaving) {
      return;
    }

    initKeyRef.current = initKey;
    if (sourcePath === entryPath && processedContent.text === content) {
      return;
    }

    setSourcePath(entryPath);
    setContent(processedContent.text);
    setDocumentKey((key) => key + 1);
  }, [
    content,
    entryPath,
    isActive,
    isContentLoading,
    isDirty,
    isSaving,
    processedContent,
    sourcePath,
  ]);

  const saveContent = async (markdown: string): Promise<DocumentSaveResult> => {
    if (
      !canEditRef.current ||
      !editablePath ||
      !isActive ||
      sessionRef.current !== session
    ) {
      return { ok: false, error: "This file is read-only." };
    }

    setIsSaving(true);
    const result = await writeContent({
      canonicalPath: editablePath,
      content: markdown,
      contentType: "text/markdown",
    });

    if (result.isErr()) {
      if (sessionRef.current === session) {
        setIsSaving(false);
      }
      return { ok: false, error: result.error.message };
    }

    await mutate(
      fileUrl,
      { kind: "loaded", content: markdown },
      { revalidate: false }
    );

    if (sessionRef.current === session) {
      setContent(markdown);
      setIsSaving(false);
    }

    return { ok: true };
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
    content: sourcePath === entryPath ? content : processedContent?.text,
    documentRef,
    documentKey,
    isDirty,
    isSaving,
    save,
    saveContent,
    setDocumentDirty,
  };
};
