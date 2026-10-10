import {
  loadDfm,
  loggableRefusal,
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
import { useImageSourceResolver } from "@app/components/editor/document/useImageSourceResolver";
import { rand } from "@app/lib/utils/seeded_random";
import datadogLogger from "@app/logger/datadogLogger";
import { Err } from "@app/types/shared/result";
import { cn } from "@dust-tt/sparkle";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { AnyExtension, JSONContent } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
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
  resolveImageSource: DocumentProps["resolveImageSource"];
}

// Refusals this page has logged, by reason and a hash of the source: a document mounting again, for
// a new live connection or a development double effect, is logged once.
const loggedRefusals = new Set<string>();

/**
 * @cc [owner:PopDaph,label:product] document-refusal-logged
 * A document the editor refuses MUST be logged once per page load, with its reason as
 * `loggableRefusal` gives it and never its content, so refusals can be counted by reason.
 */
const logRefusal = (reason: string, source: string) => {
  // `rand` seeded with the source is a stable hash of it: the source itself is not kept.
  const key = `${rand(source)()}:${reason}`;
  if (loggedRefusals.has(key)) {
    return;
  }
  loggedRefusals.add(key);
  datadogLogger.warn(
    { reason: loggableRefusal(reason) },
    "Document opened read-only"
  );
};

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
/**
 * @cc [owner:tdraier,label:performance;react] document-edits-render-free
 * A local or remote edit MUST NOT re-render the hook's host unless `dirty` or `error` changes, and
 * MUST NOT serialize the document; only a save does. Re-rendering with unchanged props MUST NOT
 * hand `useEditor` an option of a new identity, which reapplies every option to the view.
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
  const resolveSource = useImageSourceResolver(resolveImageSource);
  // Captured with the parse: a later source must not show under the reason this one was refused.
  const [unsupported] = useState(() =>
    initial.isErr() ? { reason: initial.error, source: initialContent } : null
  );
  useEffect(() => {
    if (unsupported) {
      logRefusal(unsupported.reason, unsupported.source);
    }
  }, [unsupported]);
  const [dirty, setDirtyState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const errorRef = useRef<string | null>(null);
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
    autosaveDebounceMs,
  });
  const latestDocumentRef = useRef<Node | null>(null);
  const persistedDocumentRef = useRef<Node | null>(null);
  const inflightRef = useRef<Promise<DocumentSaveResult> | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const saveRef = useRef<() => Promise<void>>(async () => undefined);

  useLayoutEffect(() => {
    persistenceRef.current = {
      onSave: persist,
      onStateChange,
      editable,
      saveErrorMessage,
      autosaveDebounceMs,
    };
  }, [persist, onStateChange, editable, saveErrorMessage, autosaveDebounceMs]);

  // Set only on a change, as edits call them: typing must not re-render the document.
  const setDirty = useCallback((next: boolean) => {
    if (dirtyRef.current !== next) {
      dirtyRef.current = next;
      setDirtyState(next);
    }
  }, []);

  const setError = useCallback((next: string | null) => {
    if (errorRef.current !== next) {
      errorRef.current = next;
      setErrorState(next);
    }
  }, []);

  const scheduleAutosave = useCallback(() => {
    clearTimeout(autosaveTimeoutRef.current);
    const { editable: canSave, autosaveDebounceMs: delay } =
      persistenceRef.current;
    if (
      !dirtyRef.current ||
      savingRef.current ||
      errorRef.current !== null ||
      !canSave
    ) {
      return;
    }
    autosaveTimeoutRef.current = setTimeout(
      () => void saveRef.current(),
      delay
    );
  }, []);

  const savedExtensions = useMemo(
    () =>
      buildDocumentEditorExtensions(t, { resolveImageSource: resolveSource }),
    [t, resolveSource]
  );

  // TipTap compares options by identity on each render, and reapplies them all to the view when
  // one differs.
  const isLive = live !== undefined;
  const content = useMemo(() => {
    if (!initial.isOk()) {
      return "";
    }
    // A live body comes from the shared document; only the threads come from the file.
    return isLive
      ? withDocumentJSONComments(
          { type: "doc", content: [{ type: "paragraph" }] },
          getDocumentJSONComments(initial.value.content)
        )
      : initial.value.content;
  }, [initial, isLive]);
  const editorProps = useMemo(
    () => ({
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
    }),
    [t]
  );

  const editor = useEditor({
    extensions: live?.extensions ?? savedExtensions,
    content,
    contentType: "json",
    immediatelyRender: false,
    editable,
    editorProps,
    onCreate: ({ editor }) => {
      if (live) {
        return;
      }
      // Normalize TipTap's trailing paragraph before capturing saved content.
      editor.view.dispatch(editor.state.tr);
      latestDocumentRef.current = editor.state.doc;
      persistedDocumentRef.current = editor.state.doc;
    },
    onUpdate: ({ editor }) => {
      const persisted = persistedDocumentRef.current;
      if (live || persisted === null) {
        return;
      }
      const document = editor.state.doc;
      latestDocumentRef.current = document;
      const changed = !document.eq(persisted);
      setDirty(changed);
      if (!changed) {
        setError(null);
      }
      scheduleAutosave();
    },
  });

  // TipTap ignores editable changes passed to useEditor after mount.
  useLayoutEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  // Hosts learn the draft state after the fact on purpose: dirty, saving and error move in several
  // places, so there is no single event to report from. The callback is read through the ref so
  // its identity cannot restart the effect.
  useEffect(() => {
    persistenceRef.current.onStateChange?.({ dirty, saving, error });
  }, [dirty, saving, error]);

  // Unmounting inside the autosave delay must not drop the edit. The editor is gone by then,
  // so this last attempt cannot report a failure; hosts hold close and navigation while dirty.
  // It waits for any save in flight, so an older write can never land after a newer one.
  useEffect(
    () => () => {
      clearTimeout(autosaveTimeoutRef.current);
      const latest = latestDocumentRef.current;
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
        const persisted = persistedDocumentRef.current;
        if (persisted !== null && latest.eq(persisted)) {
          return;
        }
        const serialized = saveDfm(envelope, latest.toJSON());
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
    const persisted = persistedDocumentRef.current;

    if (
      !editor ||
      !persist ||
      !canSave ||
      !initial.isOk() ||
      persisted === null ||
      savingRef.current
    ) {
      return;
    }

    const document = editor.state.doc;

    if (document.eq(persisted)) {
      return;
    }

    const serialized = saveDfm(initial.value.envelope, document.toJSON());
    if (serialized.isErr()) {
      setError(serialized.error);
      scheduleAutosave();
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
      persistedDocumentRef.current = document;
      setDirty(!editor.state.doc.eq(document));
    } else if (!editor.state.doc.eq(persisted)) {
      setError(result.error || failureMessage);
    }
    scheduleAutosave();
  }, [editor, initial, setDirty, setError, scheduleAutosave]);

  useLayoutEffect(() => {
    saveRef.current = save;
  }, [save]);

  const isSavable = useCallback(
    (document: JSONContent) =>
      initial.isOk() && saveDfm(initial.value.envelope, document).isOk(),
    [initial]
  );

  useEffect(() => {
    scheduleAutosave();
  }, [editable, autosaveDebounceMs, scheduleAutosave]);

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
