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
import { documentExtensions } from "./extensions";
import type { DocumentProps, DocumentSaveResult } from "./types";

const READ_ONLY_ERROR_MESSAGE = "This document is read-only.";

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
  onDirtyChange?: DocumentProps["onDirtyChange"];
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
 * @cc [owner:flvndvd,label:react] document-dirty-notifications
 * Hosts MUST receive dirty-state transitions from editor and persistence events.
 * Unchanged dirty state and callback identity changes MUST NOT trigger notifications.
 */
export const useDocumentEditor = ({
  initialContent,
  contentType,
  saveFormat = "json",
  readOnly,
  autosaveDebounceMs,
  onSave,
  onDirtyChange,
}: UseDocumentEditorProps) => {
  const [initial] = useState(() => ({
    ...parseDocumentContent(initialContent, contentType),
    contentType,
    source: initialContent,
  }));
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingSaveRef = useRef<Promise<DocumentSaveResult> | null>(null);
  const reportedDirtyRef = useRef<boolean | null>(null);
  const editable = !readOnly && onSave !== undefined && initial.ok;
  const persistenceRef = useRef({
    onSave,
    onDirtyChange,
    editable,
    baseline,
    saveFormat,
  });

  useLayoutEffect(() => {
    persistenceRef.current = {
      onSave,
      onDirtyChange,
      editable,
      baseline,
      saveFormat,
    };
  }, [onSave, onDirtyChange, editable, baseline, saveFormat]);

  const reportDirty = useCallback((dirty: boolean) => {
    if (reportedDirtyRef.current !== dirty) {
      reportedDirtyRef.current = dirty;
      persistenceRef.current.onDirtyChange?.(dirty);
    }
  }, []);

  const editor = useEditor({
    extensions: documentExtensions,
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
      persistenceRef.current = { ...persistenceRef.current, baseline: content };
      setBaseline(content);
      setDraft(content);
      reportDirty(false);
    },
    onUpdate: ({ editor }) => {
      const content = JSON.stringify(editor.getJSON());
      setDraft(content);

      const savedContent = persistenceRef.current.baseline;
      if (savedContent !== null) {
        reportDirty(content !== savedContent);
      }

      if (content === savedContent) {
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

  const save = useCallback(async (): Promise<DocumentSaveResult> => {
    if (pendingSaveRef.current) {
      return pendingSaveRef.current;
    }

    const {
      onSave: persist,
      editable: canSave,
      baseline: savedContent,
      saveFormat: format,
    } = persistenceRef.current;

    if (!editor || editor.isDestroyed || savedContent === null) {
      return { ok: false, error: "This document is not ready yet." };
    }

    const document = editor.getJSON();
    const content = JSON.stringify(document);

    if (content === savedContent) {
      return { ok: true };
    }

    if (!persist || !canSave) {
      return { ok: false, error: READ_ONLY_ERROR_MESSAGE };
    }

    const serialized =
      format === "markdown" ? serializeDocumentMarkdown(document) : content;

    if (serialized === null) {
      setError(MARKDOWN_SAVE_ERROR_MESSAGE);
      return { ok: false, error: MARKDOWN_SAVE_ERROR_MESSAGE };
    }

    setSaving(true);
    setError(null);

    const pendingSave = persistDocument(persist, serialized).then((result) => {
      pendingSaveRef.current = null;
      setSaving(false);

      if (result.ok) {
        persistenceRef.current = {
          ...persistenceRef.current,
          baseline: content,
        };
        setBaseline(content);
        if (!editor.isDestroyed) {
          reportDirty(JSON.stringify(editor.getJSON()) !== content);
        }
      } else if (
        !editor.isDestroyed &&
        JSON.stringify(editor.getJSON()) !== savedContent
      ) {
        setError(result.error || SAVE_ERROR_MESSAGE);
      }

      return result;
    });
    pendingSaveRef.current = pendingSave;
    return pendingSave;
  }, [editor, reportDirty]);

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
    unsupportedMarkdown:
      !initial.ok && initial.contentType === "markdown" ? initial.source : null,
    unsupportedFeatures: initial.ok ? [] : (initial.unsupportedFeatures ?? []),
    dirty,
    saving,
    error,
    save,
  };
};
