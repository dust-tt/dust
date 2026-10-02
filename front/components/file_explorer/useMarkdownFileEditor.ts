import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import type {
  FileWriteResult,
  MarkdownRichEditor,
} from "@app/components/file_explorer/useRichMarkdownEditor";
import { useRichMarkdownEditor } from "@app/components/file_explorer/useRichMarkdownEditor";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { putFileContentByPath } from "@app/lib/swr/files";
import type { FilePreviewCategory } from "@app/types/file_preview";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import { Err } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

export type { MarkdownRichEditor } from "@app/components/file_explorer/useRichMarkdownEditor";

interface UseMarkdownFileEditorParams {
  category: FilePreviewCategory;
  entryPath: string | undefined;
  fileUrl: string | null;
  isActive: boolean;
  isContentLoading: boolean;
  isTooLarge: boolean;
  /** The file is larger than a save may write; no editor opens it for writing. */
  exceedsWriteLimit: boolean;
  owner: LightWorkspaceType | undefined;
  /** The whole file text as fetched, for the rich editor. The processed text is trimmed and cut. */
  rawContent: string | null;
  /** The stored revision of `rawContent`, when the backend reports one. */
  revision: string | null;
  processedContent: ProcessedContent | null;
}

export interface MarkdownFileEditor {
  canEdit: boolean;
  content: string | undefined;
  /** True while leaving the file would drop an edit the rich editor has not saved yet. */
  holdsNavigation: boolean;
  /** Unsaved edits in whichever editor is open. */
  isDirty: boolean;
  isSaving: boolean;
  revert: () => void;
  /** Set when the file opens in the rich editor: every Markdown file behind the co_edition flag. */
  richEditor: MarkdownRichEditor | null;
  save: () => Promise<void>;
  setDraft: (content: string) => void;
  setViewMode: (mode: MarkdownFilePreviewViewMode) => void;
  viewMode: MarkdownFilePreviewViewMode;
}

export function useMarkdownFileEditor({
  category,
  entryPath,
  fileUrl,
  isActive,
  isContentLoading,
  isTooLarge,
  exceedsWriteLimit,
  owner,
  rawContent,
  revision,
  processedContent,
}: UseMarkdownFileEditorParams): MarkdownFileEditor {
  const [viewMode, setViewMode] =
    useState<MarkdownFilePreviewViewMode>("preview");
  const [draft, setDraft] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [resetKey, setResetKey] = useState({ isActive, path: entryPath });
  const initKeyRef = useRef<string | null>(null);

  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();
  const { hasFeature } = useFeatureFlags();

  const editablePath =
    entryPath && owner && parseCanonicalScopedPath(entryPath)
      ? entryPath
      : null;
  const canEdit = category === "markdown" && !!editablePath && !isTooLarge;

  if (isActive !== resetKey.isActive || entryPath !== resetKey.path) {
    setResetKey({ isActive, path: entryPath });
    setViewMode("preview");
    setSourcePath(null);
    setDraft("");
    setSavedContent("");
    initKeyRef.current = null;
  }

  const isPlainDirty = draft !== savedContent;

  useEffect(() => {
    if (
      !isActive ||
      !canEdit ||
      !entryPath ||
      isContentLoading ||
      !processedContent
    ) {
      return;
    }

    const initKey = `${entryPath}:${processedContent.text}`;
    if (initKeyRef.current === initKey) {
      return;
    }

    const hadInitializedForPath = initKeyRef.current?.startsWith(
      `${entryPath}:`
    );
    if (hadInitializedForPath && isPlainDirty) {
      return;
    }

    setSourcePath(entryPath);
    setDraft(processedContent.text);
    setSavedContent(processedContent.text);
    initKeyRef.current = initKey;
  }, [
    canEdit,
    entryPath,
    isActive,
    isContentLoading,
    isPlainDirty,
    processedContent,
  ]);

  /** Writes the file, only if its stored revision is still `expectedRevision` when given. */
  const writeFile = async (
    content: string,
    expectedRevision: string | null
  ): Promise<FileWriteResult> => {
    if (!owner || !editablePath) {
      return new Err({
        code: "failed",
        message: "This file cannot be edited.",
      });
    }
    return putFileContentByPath({
      owner,
      canonicalPath: editablePath,
      content,
      contentType: "text/markdown",
      revision: expectedRevision,
    });
  };

  /** Makes written content the one the preview and the plain editor show. */
  const adoptWritten = async (
    content: string,
    storedRevision: string | null
  ) => {
    await mutate(
      fileUrl,
      { kind: "loaded", content, revision: storedRevision },
      {
        revalidate: false,
      }
    );
    setDraft(content);
    setSavedContent(content);
    initKeyRef.current = `${entryPath}:${content}`;
  };

  const refetch = async () => {
    await mutate(fileUrl);
  };

  const save = async () => {
    if (!isPlainDirty || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const result = await writeFile(draft, revision);
      if (result.isOk()) {
        await adoptWritten(draft, result.value.revision);
        sendNotification({ type: "success", title: "File saved" });
      } else if (result.error.code === "conflict") {
        void refetch();
        sendNotification({
          type: "error",
          title: "File changed since it was loaded",
          description: "Reload it before saving.",
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to save file",
          description: result.error.message,
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const rich = useRichMarkdownEditor({
    enabled: hasFeature("co_edition") && canEdit,
    entryPath,
    isActive,
    rawContent,
    revision,
    exceedsWriteLimit,
    writeFile,
    adoptWritten,
    refetch,
  });

  return {
    canEdit,
    content:
      canEdit && sourcePath === entryPath ? draft : processedContent?.text,
    holdsNavigation: rich.holdsNavigation,
    isDirty: rich.richEditor ? rich.isDirty : isPlainDirty,
    isSaving: rich.richEditor ? rich.isSaving : isSaving,
    revert: () => setDraft(savedContent),
    richEditor: rich.richEditor,
    save,
    setDraft,
    setViewMode,
    viewMode: canEdit ? viewMode : "preview",
  };
}
