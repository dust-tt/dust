import {
  loadDfm,
  saveDfm,
} from "@app/components/editor/document/dfm_persistence";
import {
  getDocumentJSONComments,
  withDocumentJSONComments,
} from "@app/components/editor/document/DocumentComments";
import { buildDocumentEditorExtensions } from "@app/components/editor/document/extensions";
import type {
  DocumentProps,
  DocumentSaveResult,
} from "@app/components/editor/document/types";
import { Err } from "@app/types/shared/result";
import { cn } from "@dust-tt/sparkle";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { AnyExtension, JSONContent } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SAVE_ERROR_MESSAGE = msg`Could not save. Your changes are still here. Try again.`;

/**
 * @cc [owner:PopDaph,label:error-handling] document-save-callback-errors
 * Host save callbacks MAY reject. This boundary MUST convert their rejections into failed
 * save results so the editor can retain the draft and leave the saving state.
 */
const persistDocument = async (
  persist: NonNullable<DocumentProps["onSave"]>,
  content: string,
  failureMessage: string
): Promise<DocumentSaveResult> => {
  try {
    return await persist(content);
  } catch {
    return new Err(failureMessage);
  }
};

interface UseDocumentEditorProps {
  initialContent: string;
  readOnly: boolean;
  autosaveDebounceMs: number;
  onSave: DocumentProps["onSave"];
  onStateChange: DocumentProps["onStateChange"];
  /** Binds the editor to a synced shared document instead of the file's content. */
  live?: {
    /** The live extensions, bound to the shared document. */
    extensions: AnyExtension[];
    /** Editing pauses while the connection is down. */
    connected: boolean;
  };
  resolveImageSource?: DocumentProps["resolveImageSource"];
}

/**
 * @cc [owner:PopDaph,label:product] document-draft-preservation
 * Failed saves, including host callback rejections, MUST preserve the draft. Successful saves
 * MUST acknowledge only the submitted content, leaving later edits unsaved. Prop changes MUST
 * NOT replace an open draft. A file the editor cannot open MUST disable editing and saving.
 * Returning to the saved content MUST clear save errors without making another save request.
 * Unmounting with unsaved, editable content MUST attempt one final save of that content,
 * after any save still in flight.
 */
/**
 * @cc [owner:PopDaph,label:product] document-autosave
 * Dirty, editable content MUST autosave after autosaveDebounceMs without edits (three seconds
 * by default), with at most one save in flight. Failure MUST suspend automatic retries, except
 * the final save on unmount, until the user explicitly retries or returns to saved content.
 * Unchanged content MUST NOT trigger
 * saves. Cmd/Ctrl+S MUST allow an immediate save. Parent renders and callback identity changes
 * MUST NOT restart the debounce. Saves MUST use the latest committed callback.
 */
/**
 * @cc [owner:PopDaph,label:product] document-live-editing
 * A live editor MUST edit the shared document only: it MUST NOT save, autosave or report a
 * draft, and it is editable only while connected. It shows the file's comment threads until the
 * live extensions replace them with the session's; keeping comment marks without a thread is up
 * to the live extensions.
 */
export const useDocumentEditor = ({
  initialContent,
  readOnly,
  autosaveDebounceMs,
  onSave,
  onStateChange,
  live,
  resolveImageSource,
}: UseDocumentEditorProps) => {
  const { t } = useLingui();
  const saveErrorMessage = t(SAVE_ERROR_MESSAGE);
  const [initial] = useState(() => loadDfm(initialContent));
  // Captured at mount, like the other editor options: a new resolver would rebuild the editor.
  const [resolveSource] = useState(() => resolveImageSource);
  // Captured with the parse: a later source must not show under the reason this one was refused.
  const [unsupported] = useState(() =>
    initial.isErr() ? { reason: initial.error, source: initialContent } : null
  );
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const editable =
    !readOnly &&
    initial.isOk() &&
    (live ? live.connected : onSave !== undefined);
  // A live editor never saves: the session owns the file.
  const persist = live ? undefined : onSave;
  const persistenceRef = useRef({
    onSave: persist,
    onStateChange,
    editable,
    saveErrorMessage,
  });
  const latestRef = useRef<{ document: JSONContent; content: string } | null>(
    null
  );
  const persistedRef = useRef<string | null>(null);
  const inflightRef = useRef<Promise<DocumentSaveResult> | null>(null);

  useLayoutEffect(() => {
    persistenceRef.current = {
      onSave: persist,
      onStateChange,
      editable,
      saveErrorMessage,
    };
  }, [persist, onStateChange, editable, saveErrorMessage]);

  const savedExtensions = useMemo(
    () =>
      buildDocumentEditorExtensions(t, { resolveImageSource: resolveSource }),
    [t, resolveSource]
  );

  const editor = useEditor({
    extensions: live?.extensions ?? savedExtensions,
    // A live body comes from the shared document; only the threads come from the file.
    content: !initial.isOk()
      ? ""
      : live
        ? withDocumentJSONComments(
            { type: "doc", content: [{ type: "paragraph" }] },
            getDocumentJSONComments(initial.value.content)
          )
        : initial.value.content,
    contentType: "json",
    immediatelyRender: false,
    editable,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": t`Document content`,
        "aria-multiline": "true",
        class: cn(
          "min-h-96 text-base leading-7 wrap-anywhere caret-foreground outline-none [&>:first-child]:mt-0",
          "[&>h1:first-child]:mb-6 [&>h1:first-child]:heading-3xl @sm:[&>h1:first-child]:heading-4xl",
          "[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0 [&_.is-empty]:before:text-muted-foreground [&_.is-empty]:before:content-[attr(data-placeholder)]",
          "[&_h1.is-empty]:before:text-foreground/35 print:[&_.is-empty]:before:hidden",
          // Other people's carets in a live document; their color comes inline.
          String.raw`[&_.collaboration-carets\_\_caret]:pointer-events-none [&_.collaboration-carets\_\_caret]:relative [&_.collaboration-carets\_\_caret]:-mx-px [&_.collaboration-carets\_\_caret]:border-x [&_.collaboration-carets\_\_caret]:[word-break:normal]`,
          String.raw`[&_.collaboration-carets\_\_label]:absolute [&_.collaboration-carets\_\_label]:-top-[1.4em] [&_.collaboration-carets\_\_label]:-left-px [&_.collaboration-carets\_\_label]:rounded-[3px_3px_3px_0] [&_.collaboration-carets\_\_label]:px-1 [&_.collaboration-carets\_\_label]:py-px [&_.collaboration-carets\_\_label]:text-xs [&_.collaboration-carets\_\_label]:leading-normal [&_.collaboration-carets\_\_label]:font-semibold [&_.collaboration-carets\_\_label]:whitespace-nowrap [&_.collaboration-carets\_\_label]:text-white [&_.collaboration-carets\_\_label]:select-none`
        ),
      },
    },
    onCreate: ({ editor }) => {
      if (live) {
        return;
      }
      // Normalize TipTap's trailing paragraph before capturing saved content.
      editor.view.dispatch(editor.state.tr);
      const document = editor.getJSON();
      const content = JSON.stringify(document);
      latestRef.current = { document, content };
      persistedRef.current = content;
      setBaseline(content);
      setDraft(content);
    },
    // TODO(co-edition): a live editor never saves, yet serializes the whole document here on each
    // remote edit and thread change.
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

  // Hosts learn the draft state after the fact on purpose: dirty is derived here from the draft
  // and the saved baseline, which move in four places, so there is no single event to report
  // from. The callback is read through the ref so its identity cannot restart the effect.
  useEffect(() => {
    persistenceRef.current.onStateChange?.({ dirty, saving, error });
  }, [dirty, saving, error]);

  // Unmounting inside the autosave delay must not drop the edit. The editor is gone by then,
  // so this last attempt cannot report a failure; hosts hold close and navigation while dirty.
  // It waits for any save in flight, so an older write can never land after a newer one.
  useEffect(
    () => () => {
      const latest = latestRef.current;
      const {
        onSave: persist,
        editable: canSave,
        saveErrorMessage: failureMessage,
      } = persistenceRef.current;
      if (!persist || !canSave || !initial.isOk() || latest === null) {
        return;
      }
      const envelope = initial.value.envelope;
      const flush = async () => {
        await inflightRef.current;
        if (latest.content === persistedRef.current) {
          return;
        }
        const serialized = saveDfm(envelope, latest.document);
        if (serialized.isOk()) {
          await persistDocument(persist, serialized.value, failureMessage);
        }
      };
      void flush();
    },
    [initial]
  );

  const save = useCallback(async () => {
    const {
      onSave: persist,
      editable: canSave,
      saveErrorMessage: failureMessage,
    } = persistenceRef.current;
    const savedContent = persistedRef.current;

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

    let result: DocumentSaveResult;
    try {
      const inflight = persistDocument(
        persist,
        serialized.value,
        failureMessage
      );
      inflightRef.current = inflight;
      result = await inflight;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }

    if (result.isOk()) {
      persistedRef.current = content;
      setBaseline(content);
      return;
    }

    if (JSON.stringify(editor.getJSON()) !== savedContent) {
      setError(result.error || failureMessage);
    }
  }, [editor, initial]);

  const isSavable = useCallback(
    (document: JSONContent) =>
      initial.isOk() && saveDfm(initial.value.envelope, document).isOk(),
    [initial]
  );

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
    /** Whether the document, as TipTap JSON, would save. */
    isSavable,
  };
};
