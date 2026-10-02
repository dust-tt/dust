import type {
  DocumentDraftState,
  DocumentSaveResult,
} from "@app/components/editor/document";
import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { writeFileContentByPath } from "@app/lib/swr/files";
import type { FilePreviewCategory } from "@app/types/file_preview";
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
  isTooLarge: boolean;
  /** The preview text was cut; an editor fed with it would save a truncated file. */
  isTruncated: boolean;
  owner: LightWorkspaceType | undefined;
  /** The file text as fetched, for the rich editor. The processed text is trimmed. */
  rawContent: string | null;
  processedContent: ProcessedContent | null;
}

/** The rich Document editor takes over the file; the host hides its own edit controls. */
export interface MarkdownRichEditor {
  /** Changes when the editor must reopen on new content; use it as the component key. */
  mountKey: string;
  initialContent: string;
  onSave: (content: string) => Promise<DocumentSaveResult>;
  onStateChange: (state: DocumentDraftState) => void;
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

const IDLE_DRAFT: DocumentDraftState = {
  dirty: false,
  saving: false,
  error: null,
};

const CONFLICT_MESSAGE =
  "This file changed while you were editing. Copy your changes, then reopen the file.";

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
  const [richDraft, setRichDraft] = useState<DocumentDraftState>(IDLE_DRAFT);
  // The content the rich editor opened on or last saved, and how many times it reopened.
  const [richBase, setRichBase] = useState<string | null>(null);
  const [richVersion, setRichVersion] = useState(0);
  const [richConflict, setRichConflict] = useState(false);
  const [resetKey, setResetKey] = useState({ isActive, path: entryPath });
  const initKeyRef = useRef<string | null>(null);
  // The content this hook wrote last, so the fetch catching up with it is not a foreign change.
  const writtenRef = useRef<string | null>(null);

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
    setRichDraft(IDLE_DRAFT);
    setRichBase(null);
    setRichVersion(0);
    setRichConflict(false);
    initKeyRef.current = null;
    writtenRef.current = null;
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

  /** Writes the file and makes the written content the one the preview shows. */
  const persist = async (content: string): Promise<DocumentSaveResult> => {
    if (!owner || !editablePath) {
      return { ok: false, error: "This file cannot be edited." };
    }
    try {
      await writeFileContentByPath({
        owner,
        canonicalPath: editablePath,
        content,
        contentType: "text/markdown",
      });
    } catch (e) {
      return { ok: false, error: normalizeError(e).message };
    }
    writtenRef.current = content;
    await mutate(
      fileUrl,
      { kind: "loaded", content },
      {
        revalidate: false,
      }
    );
    setDraft(content);
    setSavedContent(content);
    initKeyRef.current = `${entryPath}:${content}`;
    return { ok: true };
  };

  const save = async () => {
    if (!isPlainDirty || isSaving) {
      return;
    }
    setIsSaving(true);
    const result = await persist(draft);
    setIsSaving(false);
    if (result.ok) {
      sendNotification({ type: "success", title: "File saved" });
    } else {
      sendNotification({
        type: "error",
        title: "Failed to save file",
        description: result.error,
      });
    }
  };

  // The decision depends only on the flag and the file, never on its content, so a change
  // written by someone else cannot swap editors under an open draft. A file the rich editor
  // cannot open is shown by it as read-only source, with the reason.
  const opensRich = hasFeature("co_edition") && canEdit && !isTruncated;
  const richSource = rawContent ?? undefined;

  // The file changed under the editor, by another writer or an agent. A clean editor reopens on
  // the new content; a dirty one keeps its draft and refuses to save over the newer version
  // until the file is reopened. The revision check on save will narrow the remaining race.
  useEffect(() => {
    if (!opensRich || richSource === undefined || richSource === richBase) {
      return;
    }
    if (richBase === null || richSource === writtenRef.current) {
      setRichBase(richSource);
    } else if (!richDraft.dirty && !richDraft.saving) {
      setRichBase(richSource);
      setRichVersion((version) => version + 1);
    } else {
      setRichConflict(true);
    }
  }, [opensRich, richSource, richBase, richDraft]);

  const saveRichSource = async (
    content: string
  ): Promise<DocumentSaveResult> => {
    if (richConflict) {
      return { ok: false, error: CONFLICT_MESSAGE };
    }
    return persist(content);
  };

  const richEditor =
    opensRich && richSource !== undefined
      ? {
          mountKey: `${entryPath}:${richVersion}`,
          initialContent: richBase ?? richSource,
          onSave: saveRichSource,
          onStateChange: setRichDraft,
        }
      : null;

  return {
    canEdit,
    content:
      canEdit && sourcePath === entryPath ? draft : processedContent?.text,
    // Once a save has failed the editor shows it with Retry; leaving then is the user's call.
    holdsNavigation:
      richEditor !== null &&
      (richDraft.dirty || richDraft.saving) &&
      richDraft.error === null,
    isDirty: opensRich ? richDraft.dirty : isPlainDirty,
    isSaving: opensRich ? richDraft.saving : isSaving,
    revert: () => setDraft(savedContent),
    richEditor,
    save,
    setDraft,
    setViewMode,
    viewMode: canEdit ? viewMode : "preview",
  };
}
