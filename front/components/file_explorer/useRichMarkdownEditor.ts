import type {
  DocumentDraftState,
  DocumentSaveResult,
} from "@app/components/editor/document";
import type { PutFileContentError } from "@app/lib/swr/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { useEffect, useRef, useState } from "react";

/** The rich Document editor takes over the file; the host hides its own edit controls. */
export interface MarkdownRichEditor {
  /** Changes when the editor must be rebuilt: another file. Use it as the component key. */
  mountKey: string;
  /** The DFM source the editor shows; a new value while it is clean is adopted in place. */
  content: string;
  onSave: (content: string) => Promise<DocumentSaveResult>;
  onStateChange: (state: DocumentDraftState) => void;
}

/** The outcome of a conditional file write: the stored revision, or why nothing was written. */
export type FileWriteResult = Result<
  { revision: string | null },
  PutFileContentError
>;

interface UseRichMarkdownEditorParams {
  /** The rich editor is wanted for this file: the flag is on and the file is editable. */
  enabled: boolean;
  entryPath: string | undefined;
  isActive: boolean;
  /** The whole file text as fetched, or null while it loads. */
  rawContent: string | null;
  /** The stored revision of `rawContent`, when the backend reports one. */
  revision: string | null;
  /** The file is larger than a save may write; the plain editor keeps it. */
  exceedsWriteLimit: boolean;
  /** Writes the file only if its stored revision is still `revision`; null skips the check. */
  writeFile: (
    content: string,
    revision: string | null
  ) => Promise<FileWriteResult>;
  /** Makes written content and its revision the ones the preview shows. */
  adoptWritten: (content: string, revision: string | null) => Promise<void>;
  /** Fetches the file again, so a version the server refused to overwrite reaches the editor. */
  refetch: () => Promise<void>;
}

export interface RichMarkdownEditorState {
  richEditor: MarkdownRichEditor | null;
  isDirty: boolean;
  isSaving: boolean;
  /** True while leaving the file would drop an edit the editor has not saved yet. */
  holdsNavigation: boolean;
}

/** What the editor opened on, or last saved. Latched: later fetches do not rewrite it. */
interface Opened {
  content: string;
  revision: string | null;
  /** The file grew past the write limit while open; the plain editor takes over once clean. */
  overLimit: boolean;
}

interface Written {
  path: string | undefined;
  content: string;
  revision: string | null;
}

const IDLE_DRAFT: DocumentDraftState = {
  dirty: false,
  saving: false,
  error: null,
};

const CONFLICT_MESSAGE =
  "This file changed while you were editing. Copy your changes, then reopen the file.";

function isOwnWrite(
  written: Written | null,
  path: string | undefined,
  content: string
): boolean {
  return (
    written !== null && written.path === path && written.content === content
  );
}

/**
 * Which content the rich editor is open on, and what happens when the file changes under it.
 * The decision to open depends only on the flag and the file as it was when it opened, never
 * on later content, so a change written by someone else cannot swap editors under a draft. A
 * clean editor takes the new content in place; a dirty one keeps its draft and refuses to
 * write over the newer version. Saves are conditional on the revision the editor opened on or last saved, so two writers
 * racing between two fetches cannot overwrite each other either.
 */
export function useRichMarkdownEditor({
  enabled,
  entryPath,
  isActive,
  rawContent,
  revision,
  exceedsWriteLimit,
  writeFile,
  adoptWritten,
  refetch,
}: UseRichMarkdownEditorParams): RichMarkdownEditorState {
  const [draft, setDraft] = useState<DocumentDraftState>(IDLE_DRAFT);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [resetKey, setResetKey] = useState({ isActive, path: entryPath });
  // The content this hook wrote last, so the fetch catching up with it is not a foreign change.
  const writtenRef = useRef<Written | null>(null);

  if (isActive !== resetKey.isActive || entryPath !== resetKey.path) {
    setResetKey({ isActive, path: entryPath });
    setDraft(IDLE_DRAFT);
    setOpened(null);
  }

  const opens = enabled && !(opened?.overLimit ?? exceedsWriteLimit);
  const source = rawContent ?? undefined;
  const base = opened?.content ?? null;

  // The file changed under the editor, by another writer or an agent. A clean editor takes the
  // new content; a dirty one keeps its draft, and `save` refuses to write over the newer
  // version until the editor is clean again.
  useEffect(() => {
    if (!opens || source === undefined || source === base) {
      return;
    }
    const written = writtenRef.current;
    if (base === null) {
      setOpened({ content: source, revision, overLimit: false });
    } else if (isOwnWrite(written, entryPath, source)) {
      // Our own write came back from the cache; the version it raced is overwritten anyway.
      setOpened({
        content: source,
        revision: written?.revision ?? revision,
        overLimit: false,
      });
    } else if (draft.dirty || draft.saving) {
      return;
    } else if (exceedsWriteLimit) {
      // Reopening on content a save could not write back would strand the next edit.
      setOpened((current) => current && { ...current, overLimit: true });
    } else {
      setOpened({ content: source, revision, overLimit: false });
    }
  }, [
    opens,
    source,
    base,
    revision,
    draft.dirty,
    draft.saving,
    exceedsWriteLimit,
    entryPath,
  ]);

  const save = async (content: string): Promise<DocumentSaveResult> => {
    // A foreign version arrived while the editor was dirty: the fetched content moved away from
    // what the editor opened on, and it is not a write of ours catching up.
    const conflict =
      base !== null &&
      source !== undefined &&
      source !== base &&
      !isOwnWrite(writtenRef.current, entryPath, source);
    if (conflict) {
      return new Err(CONFLICT_MESSAGE);
    }
    const result = await writeFile(content, opened?.revision ?? null);
    if (result.isErr()) {
      if (result.error.code === "conflict") {
        // The server saw a newer revision than ours; fetch it so the editor learns of it.
        void refetch();
        return new Err(CONFLICT_MESSAGE);
      }
      return new Err(result.error.message);
    }
    // Recorded before the cache changes, so the refetch it triggers reads as our own write.
    writtenRef.current = {
      path: entryPath,
      content,
      revision: result.value.revision,
    };
    await adoptWritten(content, result.value.revision);
    return new Ok(undefined);
  };

  const richEditor =
    opens && source !== undefined
      ? {
          mountKey: entryPath ?? "",
          content: base ?? source,
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
