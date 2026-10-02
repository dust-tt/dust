import type {
  DocumentDraftState,
  DocumentSaveResult,
} from "@app/components/editor/document";
import { Err } from "@app/types/shared/result";
import { useEffect, useRef, useState } from "react";

/** The rich Document editor takes over the file; the host hides its own edit controls. */
export interface MarkdownRichEditor {
  /** Changes when the editor must reopen on new content; use it as the component key. */
  mountKey: string;
  initialContent: string;
  onSave: (content: string) => Promise<DocumentSaveResult>;
  onStateChange: (state: DocumentDraftState) => void;
}

interface UseRichMarkdownEditorParams {
  /** The rich editor is wanted for this file: the flag is on and the file is editable. */
  enabled: boolean;
  entryPath: string | undefined;
  isActive: boolean;
  /** The file text as fetched, or null while it loads. */
  rawContent: string | null;
  /** The fetched text was cut; an editor fed with it would save a truncated file. */
  isTruncated: boolean;
  /** Writes the file; resolves once stored, or with the reason it was not. */
  writeFile: (content: string) => Promise<DocumentSaveResult>;
  /** Makes written content the one the preview shows. */
  adoptWritten: (content: string) => Promise<void>;
}

export interface RichMarkdownEditorState {
  richEditor: MarkdownRichEditor | null;
  isDirty: boolean;
  isSaving: boolean;
  /** True while leaving the file would drop an edit the editor has not saved yet. */
  holdsNavigation: boolean;
}

const IDLE_DRAFT: DocumentDraftState = {
  dirty: false,
  saving: false,
  error: null,
};

const CONFLICT_MESSAGE =
  "This file changed while you were editing. Copy your changes, then reopen the file.";

/**
 * Which content the rich editor is open on, and what happens when the file changes under it.
 * The decision to open depends only on the flag and the file as it was when it opened, never
 * on later content, so a change written by someone else cannot swap editors under a draft.
 */
export function useRichMarkdownEditor({
  enabled,
  entryPath,
  isActive,
  rawContent,
  isTruncated,
  writeFile,
  adoptWritten,
}: UseRichMarkdownEditorParams): RichMarkdownEditorState {
  const [draft, setDraft] = useState<DocumentDraftState>(IDLE_DRAFT);
  // The content the editor opened on or last saved, and how many times it reopened.
  const [base, setBase] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [conflict, setConflict] = useState(false);
  // Whether the file was over the preview limit when the editor opened on it. Latched, so a
  // foreign write growing the file cannot unmount an open editor.
  const [truncatedAtOpen, setTruncatedAtOpen] = useState<boolean | null>(null);
  const [resetKey, setResetKey] = useState({ isActive, path: entryPath });
  // The content this hook wrote last, so the fetch catching up with it is not a foreign change.
  const writtenRef = useRef<{
    path: string | undefined;
    content: string;
  } | null>(null);

  if (isActive !== resetKey.isActive || entryPath !== resetKey.path) {
    setResetKey({ isActive, path: entryPath });
    setDraft(IDLE_DRAFT);
    setBase(null);
    setVersion(0);
    setConflict(false);
    setTruncatedAtOpen(null);
  }

  const opens = enabled && !(truncatedAtOpen ?? isTruncated);
  const source = rawContent ?? undefined;

  // The file changed under the editor, by another writer or an agent. A clean editor reopens on
  // the new content; a dirty one keeps its draft and refuses to save over the newer version
  // until the file is reopened. The revision check on save will narrow the remaining race.
  useEffect(() => {
    if (!opens || source === undefined || source === base) {
      return;
    }
    const written = writtenRef.current;
    if (base === null) {
      setBase(source);
      setTruncatedAtOpen(isTruncated);
    } else if (
      written !== null &&
      written.path === entryPath &&
      written.content === source
    ) {
      // Our own write came back from the cache; the version it raced is overwritten anyway.
      setBase(source);
      setConflict(false);
    } else if (draft.dirty || draft.saving) {
      setConflict(true);
    } else if (isTruncated) {
      // Reopening on cut text would save a cut file; the plain editor takes over.
      setTruncatedAtOpen(true);
    } else {
      setBase(source);
      setVersion((current) => current + 1);
      setConflict(false);
    }
  }, [opens, source, base, draft.dirty, draft.saving, isTruncated, entryPath]);

  const save = async (content: string): Promise<DocumentSaveResult> => {
    if (conflict) {
      return new Err(CONFLICT_MESSAGE);
    }
    const result = await writeFile(content);
    if (result.isErr()) {
      return result;
    }
    // Recorded before the cache changes, so the refetch it triggers reads as our own write.
    writtenRef.current = { path: entryPath, content };
    await adoptWritten(content);
    return result;
  };

  const richEditor =
    opens && source !== undefined
      ? {
          mountKey: `${entryPath}:${version}`,
          initialContent: base ?? source,
          onSave: save,
          onStateChange: setDraft,
        }
      : null;

  return {
    richEditor,
    isDirty: draft.dirty,
    isSaving: draft.saving,
    // Once a save has failed the editor shows it with Retry; leaving then is the user's call.
    holdsNavigation:
      richEditor !== null &&
      (draft.dirty || draft.saving) &&
      draft.error === null,
  };
}
