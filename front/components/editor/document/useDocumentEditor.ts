import type { DfmEnvelope } from "@app/components/editor/document/dfm_persistence";
import {
  loadDfm,
  saveDfm,
} from "@app/components/editor/document/dfm_persistence";
import { setExternalCursor } from "@app/components/editor/document/ExternalCursor";
import { documentExtensions } from "@app/components/editor/document/extensions";
import {
  adoptionFrames,
  diffBlocks,
  insertedTextLength,
} from "@app/components/editor/document/external_changes";
import type {
  DocumentProps,
  DocumentSaveResult,
} from "@app/components/editor/document/types";
import { Err } from "@app/types/shared/result";
import { cn } from "@dust-tt/sparkle";
import type { Editor, JSONContent } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
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
const EXTERNAL_CHANGE_UNREADABLE_MESSAGE =
  "This file changed to content the editor cannot open. Reopen it to see the new version.";
/** Time between two frames of an external change, close to a display refresh. */
const FRAME_MS = 30;
/** Pace of an external change: brisker than a typist, slower than a stream, so the eye follows. */
const TYPING_CHARS_PER_SECOND = 30;
/** How long the caret lingers where an external change ended. */
const CURSOR_LINGER_MS = 1_500;

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
    return new Err(SAVE_ERROR_MESSAGE);
  }
};

interface UseDocumentEditorProps {
  content: string;
  readOnly: boolean;
  autosaveDebounceMs: number;
  externalChangeAnimationMs: number;
  onSave: DocumentProps["onSave"];
  onStateChange: DocumentProps["onStateChange"];
}

/**
 * @cc [owner:PopDaph,label:product] document-draft-preservation
 * Failed saves, including host callback rejections, MUST preserve the draft. Successful saves
 * MUST acknowledge only the submitted content, leaving later edits unsaved. A new `content`
 * while the editor is clean MUST be adopted in place, becoming the saved baseline without a
 * save; while a draft is open it MUST be ignored. A file the editor cannot open MUST disable
 * editing and saving. Returning to the saved content MUST clear save errors without making
 * another save request. Unmounting with unsaved, editable content MUST attempt one final save
 * of that content, after any save still in flight.
 */
/**
 * @cc [owner:PopDaph,label:product] document-autosave
 * Dirty, editable content MUST autosave after autosaveDebounceMs without edits (three seconds
 * by default), with at most one save in flight. Failure MUST suspend automatic retries, except
 * the final save on unmount, until the user explicitly retries or returns to saved content.
 * Unchanged content MUST NOT trigger saves, and adopting an external change MUST NOT either.
 * Cmd/Ctrl+S MUST allow an immediate save. Parent renders and callback identity changes MUST
 * NOT restart the debounce. Saves MUST use the latest committed callback.
 */
export const useDocumentEditor = ({
  content,
  readOnly,
  autosaveDebounceMs,
  externalChangeAnimationMs,
  onSave,
  onStateChange,
}: UseDocumentEditorProps) => {
  const [initial] = useState(() => loadDfm(content));
  // Captured with the parse: a later source must not show under the reason this one was refused.
  const [unsupported] = useState(() =>
    initial.isErr() ? { reason: initial.error, source: content } : null
  );
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const editable = !readOnly && onSave !== undefined && initial.isOk();
  const persistenceRef = useRef({ onSave, onStateChange, editable });
  const latestRef = useRef<{ document: JSONContent; content: string } | null>(
    null
  );
  const persistedRef = useRef<string | null>(null);
  const inflightRef = useRef<Promise<DocumentSaveResult> | null>(null);
  // The front matter and threads saves are written into; an external change can move them.
  const envelopeRef = useRef<DfmEnvelope | null>(
    initial.isOk() ? initial.value.envelope : null
  );
  // The DFM source the editor currently reflects, so the host echoing our own save or the
  // content we just adopted is not taken for another change.
  const sourceRef = useRef(content);
  const adoptionRef = useRef<{ timer: ReturnType<typeof setTimeout> } | null>(
    null
  );

  useLayoutEffect(() => {
    persistenceRef.current = { onSave, onStateChange, editable };
  }, [onSave, onStateChange, editable]);

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
      persistedRef.current = content;
      setBaseline(content);
      setDraft(content);
    },
    onUpdate: ({ editor }) => {
      if (adoptionRef.current !== null) {
        return;
      }
      const document = editor.getJSON();
      const content = JSON.stringify(document);
      latestRef.current = { document, content };
      setDraft(content);

      if (content === baseline) {
        setError(null);
      }
    },
  });

  // TipTap ignores editable changes passed to useEditor after mount. Editing is also off while
  // an external change plays, so the two cannot interleave.
  useLayoutEffect(() => {
    if (
      editor &&
      adoptionRef.current === null &&
      editor.isEditable !== editable
    ) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  const dirty = baseline !== null && draft !== baseline;

  // Hosts learn the draft state after the fact on purpose: dirty is derived here from the draft
  // and the saved baseline, which move in four places, so there is no single event to report
  // from. The callback is read through the ref so its identity cannot restart the effect.
  useEffect(() => {
    persistenceRef.current.onStateChange?.({ dirty, saving, error });
  }, [dirty, saving, error]);

  /** Marks the editor's document as the saved one, after an adopted change. */
  const settle = useCallback((editor: Editor) => {
    const document = editor.getJSON();
    const content = JSON.stringify(document);
    latestRef.current = { document, content };
    persistedRef.current = content;
    setBaseline(content);
    setDraft(content);
  }, []);

  // A new source while the editor is clean is written by someone else: an agent, or a colleague
  // in another tab. It is applied in place, a few characters per frame with a caret at the
  // insertion point, so the reader sees where the document changed and keeps their place.
  useEffect(() => {
    if (
      !editor ||
      !initial.isOk() ||
      content === sourceRef.current ||
      adoptionRef.current !== null ||
      baseline === null ||
      dirty
    ) {
      return;
    }
    sourceRef.current = content;
    const loaded = loadDfm(content);
    if (loaded.isErr()) {
      setError(EXTERNAL_CHANGE_UNREADABLE_MESSAGE);
      return;
    }
    envelopeRef.current = loaded.value.envelope;

    const before = [...editor.state.doc.children];
    const after = [
      ...editor.schema.nodeFromJSON(loaded.value.content).children,
    ];
    const changes = diffBlocks(before, after);
    const total = insertedTextLength(changes);
    // Types at a human pace, faster only when the change would otherwise exceed the time cap.
    const frameCount = Math.max(
      1,
      Math.floor(externalChangeAnimationMs / FRAME_MS)
    );
    const typingCharsPerFrame = Math.ceil(
      (TYPING_CHARS_PER_SECOND * FRAME_MS) / 1_000
    );
    const charsPerFrame =
      externalChangeAnimationMs === 0
        ? Number.POSITIVE_INFINITY
        : Math.max(typingCharsPerFrame, Math.ceil(total / frameCount));
    const frames = adoptionFrames(
      editor.schema,
      changes,
      before,
      charsPerFrame
    );

    const finish = () => {
      adoptionRef.current = null;
      editor.setEditable(persistenceRef.current.editable, false);
      settle(editor);
      setError(null);
      setTimeout(() => {
        if (!editor.isDestroyed) {
          editor.view.dispatch(setExternalCursor(editor.state.tr, null));
        }
      }, CURSOR_LINGER_MS);
    };
    const play = () => {
      if (editor.isDestroyed) {
        adoptionRef.current = null;
        return;
      }
      const next = frames.next();
      if (next.done) {
        finish();
        return;
      }
      const { from, to, blocks } = next.value;
      const fragment = Fragment.fromArray(blocks);
      const transaction = editor.state.tr.replaceWith(from, to, fragment);
      let caret = from + fragment.size;
      while (
        caret > from &&
        !transaction.doc.resolve(caret).parent.isTextblock
      ) {
        caret--;
      }
      transaction.setMeta("addToHistory", false);
      editor.view.dispatch(setExternalCursor(transaction, caret));
      adoptionRef.current = {
        timer: setTimeout(play, externalChangeAnimationMs === 0 ? 0 : FRAME_MS),
      };
    };

    editor.setEditable(false, false);
    adoptionRef.current = { timer: setTimeout(play, 0) };
  }, [
    content,
    editor,
    initial,
    baseline,
    dirty,
    externalChangeAnimationMs,
    settle,
  ]);

  // A frame still scheduled when the editor goes away must not touch it.
  useEffect(
    () => () => {
      if (adoptionRef.current !== null) {
        clearTimeout(adoptionRef.current.timer);
        adoptionRef.current = null;
      }
    },
    []
  );

  // Unmounting inside the autosave delay must not drop the edit. The editor is gone by then,
  // so this last attempt cannot report a failure; hosts hold close and navigation while dirty.
  // It waits for any save in flight, so an older write can never land after a newer one.
  useEffect(
    () => () => {
      const latest = latestRef.current;
      const envelope = envelopeRef.current;
      const { onSave: persist, editable: canSave } = persistenceRef.current;
      if (!persist || !canSave || envelope === null || latest === null) {
        return;
      }
      const flush = async () => {
        await inflightRef.current;
        if (latest.content === persistedRef.current) {
          return;
        }
        const serialized = saveDfm(envelope, latest.document);
        if (serialized.isOk()) {
          await persistDocument(persist, serialized.value);
        }
      };
      void flush();
    },
    []
  );

  const save = useCallback(async () => {
    const { onSave: persist, editable: canSave } = persistenceRef.current;
    const savedContent = persistedRef.current;
    const envelope = envelopeRef.current;

    if (
      !editor ||
      !persist ||
      !canSave ||
      envelope === null ||
      savedContent === null ||
      savingRef.current ||
      adoptionRef.current !== null
    ) {
      return;
    }

    const document = editor.getJSON();
    const content = JSON.stringify(document);

    if (content === savedContent) {
      return;
    }

    const serialized = saveDfm(envelope, document);
    if (serialized.isErr()) {
      setError(serialized.error);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    let result: DocumentSaveResult;
    try {
      const inflight = persistDocument(persist, serialized.value);
      inflightRef.current = inflight;
      result = await inflight;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }

    if (result.isOk()) {
      // The host will echo this source back as `content`; it is ours, not a change to adopt.
      sourceRef.current = serialized.value;
      persistedRef.current = content;
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
    /** Why the file cannot be edited, with its source, or null when it opened. */
    unsupported,
    dirty,
    saving,
    error,
    save,
  };
};
