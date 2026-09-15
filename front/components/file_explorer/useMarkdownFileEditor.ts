import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import type { FilePreviewCategory } from "@app/components/file_explorer/utils";
import { useSendNotification } from "@app/hooks/useNotification";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { writeFileContentByPath } from "@app/lib/swr/files";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

interface UseMarkdownFileEditorParams {
  category: FilePreviewCategory;
  entryPath: string | undefined;
  fileUrl: string | null;
  isActive: boolean;
  isContentLoading: boolean;
  owner: LightWorkspaceType | undefined;
  processedContent: ProcessedContent | null;
}

interface MarkdownFileEditor {
  canEdit: boolean;
  content: string | undefined;
  isDirty: boolean;
  isSaving: boolean;
  revert: () => void;
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
  owner,
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

  const editablePath =
    entryPath && owner && parseCanonicalScopedPath(entryPath)
      ? entryPath
      : null;
  const canEdit = category === "markdown" && !!editablePath;

  if (isActive !== resetKey.isActive || entryPath !== resetKey.path) {
    setResetKey({ isActive, path: entryPath });
    setViewMode("preview");
    setSourcePath(null);
    setDraft("");
    setSavedContent("");
    initKeyRef.current = null;
  }

  const isDirty = draft !== savedContent;

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
    if (hadInitializedForPath && isDirty) {
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
    isDirty,
    processedContent,
  ]);

  const save = async () => {
    if (!owner || !editablePath || !isDirty || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      await writeFileContentByPath({
        owner,
        canonicalPath: editablePath,
        content: draft,
        contentType: "text/markdown",
      });
      await mutate(
        fileUrl,
        { kind: "loaded", content: draft },
        {
          revalidate: false,
        }
      );
      setSavedContent(draft);
      initKeyRef.current = `${entryPath}:${draft}`;
      sendNotification({ type: "success", title: "File saved" });
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Failed to save file",
        description: normalizeError(e).message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    canEdit,
    content:
      canEdit && sourcePath === entryPath ? draft : processedContent?.text,
    isDirty,
    isSaving,
    revert: () => setDraft(savedContent),
    save,
    setDraft,
    setViewMode,
    viewMode: canEdit ? viewMode : "preview",
  };
}
