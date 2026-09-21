import { cn } from "@sparkle/lib/utils";
import { useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
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
 * Failed saves MUST preserve the draft. A successful save MUST acknowledge only the submitted
 * content; edits made during the request MUST remain unsaved. Prop changes MUST NOT replace an
 * open draft. Invalid stored content MUST disable editing and saving rather than discard it.
 * Returning to the saved content MUST clear save errors without making another save request.
 * Rejections from the host persistence callback MUST be treated as failed saves.
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
  const onSaveRef = useRef(onSave);
  const editable = !readOnly && onSave !== undefined && initial.ok;

  // The timer needs the latest committed callback without restarting when its identity changes.
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

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
      // Normalize extension-added content (e.g. the trailing paragraph) before the saved baseline.
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

  // TipTap's React hook preserves its current editability when applying updated options.
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  const dirty = baseline !== null && draft !== baseline;

  const save = useCallback(async () => {
    const persist = onSaveRef.current;

    if (!editor || !persist || !editable || !dirty || savingRef.current) {
      return;
    }

    const content = JSON.stringify(editor.getJSON());
    savingRef.current = true;
    setSaving(true);
    setError(null);

    // Only the host callback crosses a boundary where thrown failures are expected.
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

    // The user may have undone their changes while persistence was still in flight.
    if (JSON.stringify(editor.getJSON()) !== baseline) {
      setError(result.error || SAVE_ERROR_MESSAGE);
    }
  }, [editor, editable, dirty, baseline]);

  useEffect(() => {
    if (draft === null || !dirty || saving || error || !editable) {
      return;
    }

    // Debounce document changes, including edits made during an earlier save. Never retry errors in a loop.
    const timeout = setTimeout(() => void save(), autosaveDebounceMs);
    return () => clearTimeout(timeout);
  }, [draft, dirty, saving, error, editable, save, autosaveDebounceMs]);

  return { editor, editable, valid: initial.ok, dirty, saving, error, save };
};
