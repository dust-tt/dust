import type { DocumentSaveResult } from "@app/components/editor/document";
import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import { CUT_TEXT_SAVE_REFUSED } from "@app/components/file_explorer/previewText";
import type { MarkdownRichEditor } from "@app/components/file_explorer/useRichMarkdownEditor";
import { useRichMarkdownEditor } from "@app/components/file_explorer/useRichMarkdownEditor";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { writeFileContentByPath } from "@app/lib/swr/files";
import type { FilePreviewCategory } from "@app/types/file_preview";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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
  /** The preview text was cut; an editor fed with it would save a truncated file. */
  isTruncated: boolean;
  owner: LightWorkspaceType | undefined;
  /** The file text as fetched, for the rich editor. The processed text is trimmed. */
  rawContent: string | null;
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
  isTruncated,
  owner,
  rawContent,
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
  const canOpenEditor =
    category === "markdown" && !!editablePath && !isTooLarge;

  if (isActive !== resetKey.isActive || entryPath !== resetKey.path) {
    setResetKey({ isActive, path: entryPath });
    setViewMode("preview");
    setSourcePath(null);
    setDraft("");
    setSavedContent("");
    initKeyRef.current = null;
  }

  const isPlainDirty = draft !== savedContent;
  // The plain editor edits the preview text; saving it after a cut would truncate the file. A
  // draft already open stays on screen when the file grows past the cut, until it is reverted,
  // and `save` refuses it.
  const canEdit = canOpenEditor && (!isTruncated || isPlainDirty);

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

  const writeFile = async (content: string): Promise<DocumentSaveResult> => {
    if (!owner || !editablePath) {
      return new Err("This file cannot be edited.");
    }
    try {
      await writeFileContentByPath({
        owner,
        canonicalPath: editablePath,
        content,
        contentType: "text/markdown",
      });
      return new Ok(undefined);
    } catch (e) {
      return new Err(normalizeError(e).message);
    }
  };

  /**
   * Makes written content the one the preview shows and the plain editor's saved baseline. The
   * plain draft is left alone: whatever was typed or undone during the save is still the draft.
   */
  const adoptWritten = async (content: string) => {
    await mutate(
      fileUrl,
      { kind: "loaded", content },
      {
        revalidate: false,
      }
    );
    setSavedContent(content);
    initKeyRef.current = `${entryPath}:${content}`;
  };

  const save = async () => {
    if (!isPlainDirty || isSaving) {
      return;
    }
    if (isTruncated) {
      sendNotification({ type: "error", ...CUT_TEXT_SAVE_REFUSED });
      return;
    }
    setIsSaving(true);
    try {
      const result = await writeFile(draft);
      if (result.isOk()) {
        await adoptWritten(draft);
        sendNotification({ type: "success", title: "File saved" });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to save file",
          description: result.error,
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const rich = useRichMarkdownEditor({
    // Not `canEdit`: an open rich editor must not unmount under a draft when the file grows.
    enabled: hasFeature("co_edition") && canOpenEditor,
    entryPath,
    isActive,
    rawContent,
    isTruncated,
    writeFile,
    // The plain editor is not shown while the rich one is open, so its draft follows the file.
    adoptWritten: async (content) => {
      await adoptWritten(content);
      setDraft(content);
    },
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
