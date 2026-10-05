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
import { recoverCommentAdditions } from "./recoverCommentAdditions";
import type { DocumentProps, DocumentSaveResult } from "./types";

const SAVE_ERROR_MESSAGE =
  "Could not save. Your changes are still here. Try again.";
const MARKDOWN_SAVE_ERROR_MESSAGE =
  "This formatting cannot be saved as Markdown yet. Your changes are still here. Undo the last edit to try again.";

/**
 * @cc [owner:flvndvd,label:error-handling] document-save-callback-errors
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
  contentType: "markdown" | "json";
  saveFormat?: DocumentProps["saveFormat"];
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
 * @cc [owner:flvndvd,label:product] document-comment-save-retry
 * A conflict MAY be retried once for comment additions on unchanged content. Recovery MUST
 * stop if the draft changed while saving or write access was revoked. Before retrying, the
 * editor MUST adopt the fetched snapshot as its baseline and preserve the local additions.
 * Edits made during the retry MUST remain unsaved after its acknowledgement. A failed retry
 * MUST preserve the recovered draft and suspend autosave until an explicit retry or a return
 * to the adopted snapshot.
 */
/**
 * @cc [owner:flvndvd,label:product] document-autosave
 * Dirty, editable content MUST autosave after autosaveDebounceMs without edits (three seconds by default),
 * with at most one save in flight.
 * After the bounded comment recovery attempt, failure MUST suspend automatic retries until
 * the user explicitly retries or returns to saved content. Unchanged content MUST NOT trigger
 * saves. Cmd/Ctrl+S MUST allow an immediate save.
 * Parent renders and callback identity changes MUST NOT restart the debounce. Saves MUST use
 * the latest committed callback.
 */
/**
 * @cc [owner:flvndvd,label:product] document-save-format
 * Saves MUST default to JSON regardless of the input format. Markdown saves MUST use the
 * committed saveFormat. Opening a document or changing its output format MUST NOT write it.
 */
export const useDocumentEditor = ({
  initialContent,
  contentType,
  saveFormat = "json",
  readOnly,
  autosaveDebounceMs,
  onSave,
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
  const savingRef = useRef(false);
  const editable = !readOnly && onSave !== undefined && initial.ok;
  const persistenceRef = useRef({ onSave, editable, baseline, saveFormat });

  useLayoutEffect(() => {
    persistenceRef.current = { onSave, editable, baseline, saveFormat };
  }, [onSave, editable, baseline, saveFormat]);

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

    const serialized =
      format === "markdown" ? serializeDocumentMarkdown(document) : content;

    if (serialized === null) {
      setError(MARKDOWN_SAVE_ERROR_MESSAGE);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    let result = await persistDocument(persist, serialized);
    let acknowledgedContent = content;
    let failureBaseline = savedContent;
    if (
      !result.ok &&
      result.conflict &&
      format === "json" &&
      !editor.isDestroyed &&
      persistenceRef.current.editable &&
      JSON.stringify(editor.getJSON()) === content
    ) {
      const latest = parseDocumentContent(result.conflict.content, "json");
      if (latest.ok) {
        const latestDoc = editor.schema.nodeFromJSON(latest.content);
        const recovery = recoverCommentAdditions(
          editor.state,
          editor.schema.nodeFromJSON(JSON.parse(savedContent)),
          latestDoc
        );
        if (recovery) {
          failureBaseline = JSON.stringify(latestDoc.toJSON());
          setBaseline(failureBaseline);
          editor.view.dispatch(recovery);
          acknowledgedContent = JSON.stringify(editor.getJSON());
          result = await persistDocument(
            result.conflict.adoptAndSave,
            acknowledgedContent
          );
        }
      }
    }

    savingRef.current = false;
    setSaving(false);

    if (result.ok) {
      setBaseline(acknowledgedContent);
      return;
    }

    if (JSON.stringify(editor.getJSON()) !== failureBaseline) {
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
    unsupportedMarkdown:
      !initial.ok && initial.contentType === "markdown" ? initial.source : null,
    dirty,
    saving,
    error,
    save,
  };
};
