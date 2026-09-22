import { cn } from "@sparkle/lib/utils";
import { useEditor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { parseDocumentContent, serializeDocumentMarkdown } from "./content";
import { DocumentFrame } from "./DocumentFrame";
import { DocumentFrameWithView } from "./DocumentFrameView";
import { DocumentInputValidation } from "./DocumentInputValidation";
import { documentExtensions } from "./extensions";
import type { DocumentProps, DocumentSaveResult } from "./types";

const editorExtensions = documentExtensions.map((extension) =>
  extension === DocumentFrame ? DocumentFrameWithView : extension
);

const SAVE_ERROR_MESSAGE =
  "Could not save. Your changes are still here. Try again.";
const MARKDOWN_SAVE_ERROR_MESSAGE =
  "This formatting cannot be saved as Markdown yet. Your changes are still here. Undo the last edit to try again.";

interface UseDocumentEditorProps {
  initialContent: string;
  contentType: "markdown" | "json";
  saveFormat?: DocumentProps["saveFormat"];
  readOnly: boolean;
  autosaveDebounceMs: number;
  onSave: DocumentProps["onSave"];
  onPendingChangesChange?: DocumentProps["onPendingChangesChange"];
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
/**
 * @cc [owner:flvndvd,label:product] document-save-format
 * Saves MUST default to JSON regardless of the input format. Markdown saves MUST use the
 * committed saveFormat. Opening a document or changing its output format MUST NOT write it.
 */
/**
 * @cc [owner:flvndvd,label:product] document-pending-events
 * Pending-change notifications MUST reflect unsaved content or an in-flight save.
 * Save completion MUST acknowledge only submitted content. Unmounted editors MUST NOT
 * notify the host, including when an earlier save finishes after a new session opens.
 */
export const useDocumentEditor = ({
  initialContent,
  contentType,
  saveFormat = "json",
  readOnly,
  autosaveDebounceMs,
  onSave,
  onPendingChangesChange,
}: UseDocumentEditorProps) => {
  const [initial] = useState(() => ({
    ...parseDocumentContent(initialContent, contentType),
    contentType,
    source: initialContent,
  }));
  const [inputError, setInputError] = useState<string | null>(null);
  const [extensions] = useState(() => [
    ...editorExtensions,
    DocumentInputValidation.configure({ onRejected: setInputError }),
  ]);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const editable = !readOnly && onSave !== undefined && initial.ok;
  const persistenceRef = useRef({
    onSave,
    editable,
    baseline,
    saveFormat,
    onPendingChangesChange,
  });

  useLayoutEffect(() => {
    persistenceRef.current = {
      onSave,
      editable,
      baseline,
      saveFormat,
      onPendingChangesChange,
    };
  }, [onSave, editable, baseline, saveFormat, onPendingChangesChange]);

  const editor = useEditor({
    extensions,
    content: initial.ok ? initial.content : "",
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
      const content = JSON.stringify(editor.getJSON());
      setBaseline(content);
      setDraft(content);
      persistenceRef.current.baseline = content;
      persistenceRef.current.onPendingChangesChange?.(false);
    },
    onUpdate: ({ editor }) => {
      setInputError(null);
      const content = JSON.stringify(editor.getJSON());
      setDraft(content);
      persistenceRef.current.onPendingChangesChange?.(
        savingRef.current || content !== persistenceRef.current.baseline
      );

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
      saveFormat: format,
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

    const document = editor.getJSON();
    const content = JSON.stringify(document);

    if (content === savedContent) {
      return;
    }

    const validated = parseDocumentContent(content, "json");
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    const serialized =
      format === "markdown" ? serializeDocumentMarkdown(document) : content;

    if (serialized === null) {
      setError(MARKDOWN_SAVE_ERROR_MESSAGE);
      return;
    }

    savingRef.current = true;
    persistenceRef.current.onPendingChangesChange?.(true);
    setSaving(true);
    setError(null);

    let result: DocumentSaveResult;
    try {
      result = await persist(serialized);
    } catch {
      result = { ok: false, error: SAVE_ERROR_MESSAGE };
    }

    savingRef.current = false;
    setSaving(false);

    if (mountedRef.current && !editor.isDestroyed) {
      persistenceRef.current.onPendingChangesChange?.(
        JSON.stringify(editor.getJSON()) !==
          (result.ok ? content : savedContent)
      );
    }

    if (result.ok) {
      persistenceRef.current.baseline = content;
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

  return {
    editor,
    editable,
    valid: initial.ok,
    validationError: initial.ok ? null : initial.error,
    unsupportedMarkdown:
      !initial.ok && initial.contentType === "markdown" ? initial.source : null,
    dirty,
    saving,
    error,
    inputError,
    save,
  };
};
