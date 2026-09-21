import { cn } from "@sparkle/lib/utils";
import { useEditor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { documentExtensions, parseDocumentContent } from "./extensions";
import type { DocumentProps, DocumentSaveResult } from "./types";

const SAVE_ERROR_MESSAGE =
  "Could not save. Your changes are still here. Try again.";

interface UseDocumentEditorProps {
  initialContent: string;
  contentType: "markdown" | "json";
  readOnly: boolean;
  autosaveDebounceMs: number;
  onSave: DocumentProps["onSave"];
}

/**
 * @cc [owner:flvndvd,label:product] document-draft-preservation
 * Failed saves, including host callback rejections, MUST preserve the draft. Successful saves
 * MUST acknowledge only the submitted content, leaving later edits unsaved. Prop changes MUST
 * NOT replace an open draft. Invalid stored content MUST disable editing and saving.
 * Returning to the saved content MUST clear save errors without making another save request.
 */
/**
 * @cc [owner:flvndvd,label:product] document-autosave
 * Dirty, editable content MUST autosave after autosaveDebounceMs without edits (three seconds by default),
 * with at most one save in flight.
 * Failure MUST suspend automatic retries until the user explicitly retries or returns to saved
 * content. Unchanged content MUST NOT trigger saves. Cmd/Ctrl+S MUST allow an immediate save.
 * Parent renders and callback identity changes MUST NOT restart the debounce. Saves MUST use
 * the latest committed callback.
 */
export const useDocumentEditor = ({
  initialContent,
  contentType,
  readOnly,
  autosaveDebounceMs,
  onSave,
}: UseDocumentEditorProps) => {
  const [initial] = useState(() => ({
    ...parseDocumentContent(initialContent, contentType),
    contentType,
  }));
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const editable = !readOnly && onSave !== undefined && initial.ok;
  const persistenceRef = useRef({ onSave, editable, baseline });

  useLayoutEffect(() => {
    persistenceRef.current = { onSave, editable, baseline };
  }, [onSave, editable, baseline]);

  const editor = useEditor({
    extensions: documentExtensions,
    content: initial.ok ? initial.content : "",
    contentType: initial.contentType,
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
      const content = JSON.stringify(editor.getJSON());
      setBaseline(content);
      setDraft(content);
    },
    onUpdate: ({ editor }) => {
      const content = JSON.stringify(editor.getJSON());
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
      savedContent === null ||
      savingRef.current
    ) {
      return;
    }

    const content = JSON.stringify(editor.getJSON());

    if (content === savedContent) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    let result: DocumentSaveResult;
    try {
      result = await persist(content);
    } catch {
      result = { ok: false, error: SAVE_ERROR_MESSAGE };
    }

    savingRef.current = false;
    setSaving(false);

    if (result.ok) {
      setBaseline(content);
      return;
    }

    if (JSON.stringify(editor.getJSON()) !== savedContent) {
      setError(result.error || SAVE_ERROR_MESSAGE);
    }
  }, [editor]);

  useEffect(() => {
    if (draft === null || !dirty || saving || error || !editable) {
      return;
    }

    const timeout = setTimeout(() => void save(), autosaveDebounceMs);
    return () => clearTimeout(timeout);
  }, [draft, dirty, saving, error, editable, save, autosaveDebounceMs]);

  return { editor, editable, valid: initial.ok, dirty, saving, error, save };
};
