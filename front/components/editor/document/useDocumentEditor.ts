import {
  loadDfm,
  saveDfm,
} from "@app/components/editor/document/dfm_persistence";
import { documentExtensions } from "@app/components/editor/document/extensions";
import type {
  DocumentProps,
  DocumentSaveResult,
} from "@app/components/editor/document/types";
import { cn } from "@dust-tt/sparkle";
import type { JSONContent } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const SAVE_ERROR_MESSAGE =
  "Could not save. Your changes are still here. Try again.";

/**
 * @cc [owner:PopDaph,label:error-handling] document-save-callback-errors
 * Host save callbacks MAY reject. This boundary MUST convert their rejections into failed
 * save results so the editor can retain the draft and leave the saving state.
 */
const persistDocument = async (
  persist: NonNullable<DocumentProps["onSave"]>,
  content: string
): Promise<DocumentSaveResult> => {
  try {
    return await persist(content);
  } catch {
    return { ok: false, error: SAVE_ERROR_MESSAGE };
  }
};

interface UseDocumentEditorProps {
  initialContent: string;
  readOnly: boolean;
  autosaveDebounceMs: number;
  onSave: DocumentProps["onSave"];
}

/**
 * @cc [owner:PopDaph,label:product] document-draft-preservation
 * Failed saves, including host callback rejections, MUST preserve the draft. Successful saves
 * MUST acknowledge only the submitted content, leaving later edits unsaved. Prop changes MUST
 * NOT replace an open draft. A file the editor cannot open MUST disable editing and saving.
 * Returning to the saved content MUST clear save errors without making another save request.
 * Unmounting with unsaved, editable content MUST attempt one final save of that content.
 */
/**
 * @cc [owner:PopDaph,label:product] document-autosave
 * Dirty, editable content MUST autosave after autosaveDebounceMs without edits (three seconds
 * by default), with at most one save in flight. Failure MUST suspend automatic retries until
 * the user explicitly retries or returns to saved content. Unchanged content MUST NOT trigger
 * saves. Cmd/Ctrl+S MUST allow an immediate save. Parent renders and callback identity changes
 * MUST NOT restart the debounce. Saves MUST use the latest committed callback.
 */
export const useDocumentEditor = ({
  initialContent,
  readOnly,
  autosaveDebounceMs,
  onSave,
}: UseDocumentEditorProps) => {
  const [initial] = useState(() => loadDfm(initialContent));
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const editable = !readOnly && onSave !== undefined && initial.isOk();
  const persistenceRef = useRef({ onSave, editable, baseline });
  const latestRef = useRef<{ document: JSONContent; content: string } | null>(
    null
  );

  useLayoutEffect(() => {
    persistenceRef.current = { onSave, editable, baseline };
  }, [onSave, editable, baseline]);

  const editor = useEditor({
    extensions: documentExtensions,
    content: initial.isOk() ? initial.value.content : "",
    contentType: "json",
    immediatelyRender: false,
    editable,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Document content",
        "aria-multiline": "true",
        class: cn(
          "min-h-96 text-base leading-7 wrap-anywhere caret-foreground outline-none [&>:first-child]:mt-0",
          "[&>h1:first-child]:mb-6 [&>h1:first-child]:heading-3xl @sm:[&>h1:first-child]:heading-4xl",
          "[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0 [&_.is-empty]:before:text-muted-foreground [&_.is-empty]:before:content-[attr(data-placeholder)]",
          "[&_h1.is-empty]:before:text-foreground/35 print:[&_.is-empty]:before:hidden"
        ),
      },
    },
    onCreate: ({ editor }) => {
      // Normalize TipTap's trailing paragraph before capturing saved content.
      editor.view.dispatch(editor.state.tr);
      const document = editor.getJSON();
      const content = JSON.stringify(document);
      latestRef.current = { document, content };
      setBaseline(content);
      setDraft(content);
    },
    onUpdate: ({ editor }) => {
      const document = editor.getJSON();
      const content = JSON.stringify(document);
      latestRef.current = { document, content };
      setDraft(content);

      if (content === baseline) {
        setError(null);
      }
    },
  });

  // TipTap ignores editable changes passed to useEditor after mount.
  useLayoutEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  const dirty = baseline !== null && draft !== baseline;

  // Closing the host inside the autosave delay must not drop the edit. The editor is gone by
  // then, so this last attempt cannot report a failure; hosts hold navigation while dirty.
  useEffect(
    () => () => {
      const latest = latestRef.current;
      const {
        onSave: persist,
        editable: canSave,
        baseline: savedContent,
      } = persistenceRef.current;
      if (
        !persist ||
        !canSave ||
        !initial.isOk() ||
        latest === null ||
        latest.content === savedContent
      ) {
        return;
      }
      const serialized = saveDfm(initial.value.envelope, latest.document);
      if (serialized.isOk()) {
        void persistDocument(persist, serialized.value);
      }
    },
    [initial]
  );

  const save = useCallback(async () => {
    const {
      onSave: persist,
      editable: canSave,
      baseline: savedContent,
    } = persistenceRef.current;

    if (
      !editor ||
      !persist ||
      !canSave ||
      !initial.isOk() ||
      savedContent === null ||
      savingRef.current
    ) {
      return;
    }

    const document = editor.getJSON();
    const content = JSON.stringify(document);

    if (content === savedContent) {
      return;
    }

    const serialized = saveDfm(initial.value.envelope, document);
    if (serialized.isErr()) {
      setError(serialized.error);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    const result = await persistDocument(persist, serialized.value);

    savingRef.current = false;
    setSaving(false);

    if (result.ok) {
      setBaseline(content);
      return;
    }

    if (JSON.stringify(editor.getJSON()) !== savedContent) {
      setError(result.error || SAVE_ERROR_MESSAGE);
    }
  }, [editor, initial]);

  useEffect(() => {
    if (draft === null || !dirty || saving || error || !editable) {
      return;
    }

    const timeout = setTimeout(() => void save(), autosaveDebounceMs);
    return () => clearTimeout(timeout);
  }, [draft, dirty, saving, error, editable, save, autosaveDebounceMs]);

  return {
    editor,
    editable,
    /** Why the file cannot be edited, with its source, or null when it opened. */
    unsupported: initial.isErr()
      ? { reason: initial.error, source: initialContent }
      : null,
    dirty,
    saving,
    error,
    save,
  };
};
