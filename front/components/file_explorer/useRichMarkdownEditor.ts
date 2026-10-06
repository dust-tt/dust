import type {
  DocumentDraftState,
  DocumentSaveResult,
} from "@app/components/editor/document";
import { Err } from "@app/types/shared/result";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

/** The rich Document editor takes over the file; the host hides its own edit controls. */
export interface MarkdownRichEditor {
  /** Changes when the editor must reopen on new content; use it as the component key. */
  mountKey: string;
  /** Scoped path of the file the editor writes. */
  path: string;
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

/** What the editor opened on, or last saved. Latched: later fetches do not rewrite it. */
interface Opened {
  content: string;
  /** The file was over the preview limit at that moment; the plain editor keeps it. */
  truncated: boolean;
}

interface Written {
  path: string | undefined;
  content: string;
}

const IDLE_DRAFT: DocumentDraftState = {
  dirty: false,
  saving: false,
  error: null,
};

const CONFLICT_MESSAGE = msg`This file changed while you were editing. Copy your changes, then reopen the file.`;

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
  const { t } = useLingui();
  const [draft, setDraft] = useState<DocumentDraftState>(IDLE_DRAFT);
  const [opened, setOpened] = useState<Opened | null>(null);
  // How many times the editor reopened on foreign content; part of the mount key. Reopening
  // loses the scroll position; the next step applies foreign changes in place instead.
  const [version, setVersion] = useState(0);
  const [resetKey, setResetKey] = useState({ isActive, path: entryPath });
  // The content this hook wrote last, so the fetch catching up with it is not a foreign change.
  const writtenRef = useRef<Written | null>(null);

  if (isActive !== resetKey.isActive || entryPath !== resetKey.path) {
    setResetKey({ isActive, path: entryPath });
    setDraft(IDLE_DRAFT);
    setOpened(null);
    setVersion(0);
  }

  const opens = enabled && !(opened?.truncated ?? isTruncated);
  const source = rawContent ?? undefined;
  const base = opened?.content ?? null;

  // The file changed under the editor, by another writer or an agent. A clean editor reopens on
  // the new content; a dirty one keeps its draft, and `save` refuses to write over the newer
  // version until the editor is clean or the file reopened. The revision check on save will
  // narrow the remaining race.
  useEffect(() => {
    if (!opens || source === undefined || source === base) {
      return;
    }
    if (base === null) {
      setOpened({ content: source, truncated: isTruncated });
    } else if (isOwnWrite(writtenRef.current, entryPath, source)) {
      // Our own write came back from the cache; the version it raced is overwritten anyway.
      setOpened({ content: source, truncated: false });
    } else if (draft.dirty || draft.saving) {
      return;
    } else if (isTruncated) {
      // Reopening on cut text would save a cut file; the plain editor takes over.
      setOpened({ content: base, truncated: true });
    } else {
      setOpened({ content: source, truncated: false });
      setVersion((current) => current + 1);
    }
  }, [opens, source, base, draft.dirty, draft.saving, isTruncated, entryPath]);

  const save = async (content: string): Promise<DocumentSaveResult> => {
    // A foreign version arrived while the editor was dirty: the fetched content moved away from
    // what the editor opened on, and it is not a write of ours catching up.
    const conflict =
      base !== null &&
      source !== undefined &&
      source !== base &&
      !isOwnWrite(writtenRef.current, entryPath, source);
    if (conflict) {
      return new Err(t(CONFLICT_MESSAGE));
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
    opens && source !== undefined && entryPath !== undefined
      ? {
          mountKey: `${entryPath}:${version}`,
          path: entryPath,
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
