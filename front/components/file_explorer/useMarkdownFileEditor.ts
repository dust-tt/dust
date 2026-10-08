import type { DocumentSaveResult } from "@app/components/editor/document";
import { CUT_TEXT_SAVE_REFUSED } from "@app/components/file_explorer/FilePreviewContent";
import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import type { MarkdownRichEditor } from "@app/components/file_explorer/useRichMarkdownEditor";
import { useRichMarkdownEditor } from "@app/components/file_explorer/useRichMarkdownEditor";
import { useSendNotification } from "@app/hooks/useNotification";
import { formatError } from "@app/lib/api_error_messages";
import { useCollabUrl, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { writeFileContentByPath } from "@app/lib/swr/files";
import type { FilePreviewCategory } from "@app/types/file_preview";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
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
  /** The mount accepts writes from this user; no editor opens otherwise. */
  canWrite: boolean;
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
  canWrite,
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

  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();
  const { hasFeature } = useFeatureFlags();
  const collabUrl = useCollabUrl();

  const editablePath =
    entryPath && owner && parseCanonicalScopedPath(entryPath)
      ? entryPath
      : null;
  const canOpenEditor =
    category === "markdown" && !!editablePath && !isTooLarge && canWrite;

  if (isActive !== resetKey.isActive || entryPath !== resetKey.path) {
    setResetKey({ isActive, path: entryPath });
    setViewMode("preview");
    setSourcePath(null);
    setDraft("");
    setSavedContent("");
    initKeyRef.current = null;
  }

  const isPlainDirty = draft !== savedContent;
  // Saving cut preview text would truncate the file. An open draft stays so it can be copied.
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
      return new Err(t`This file cannot be edited.`);
    }
    const result = await writeFileContentByPath({
      owner,
      canonicalPath: editablePath,
      content,
      contentType: "text/markdown",
    });
    return result.isOk()
      ? new Ok(undefined)
      : new Err(
          formatError(result.error, {
            hasLocalisation: hasFeature("localisation"),
          }).description
        );
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
      sendNotification({
        type: "error",
        title: t(CUT_TEXT_SAVE_REFUSED.title),
        description: t(CUT_TEXT_SAVE_REFUSED.description),
      });
      return;
    }
    setIsSaving(true);
    try {
      const result = await writeFile(draft);
      if (result.isOk()) {
        await adoptWritten(draft);
        sendNotification({ type: "success", title: t`File saved` });
      } else {
        // we loose the error details here because we want to be iso between the rich and plain editor
        sendNotification({
          type: "error",
          title: t`Failed to save file`,
          description: result.error,
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const rich = useRichMarkdownEditor({
    // Not `canEdit`: an open rich editor must not unmount when the file grows past the cut.
    enabled: hasFeature("co_edition") && canOpenEditor,
    liveUrl: collabUrl,
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
