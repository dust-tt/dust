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
import type { DocumentProps } from "@app/components/editor/document/types";
import { useImageSourceResolver } from "@app/components/editor/document/useImageSourceResolver";
import { isEditableTarget } from "@app/hooks/useAppKeyboardShortcuts";
import { rand } from "@app/lib/utils/seeded_random";
import datadogLogger from "@app/logger/datadogLogger";
import { cn } from "@dust-tt/sparkle";
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

interface UseDocumentEditorProps {
  initialContent: string;
  readOnly: boolean;
  /** Binds the editor to a synced shared document; without it, the file's content is read-only. */
  live?: {
    /** The live extensions, bound to the shared document. */
    extensions: AnyExtension[];
    /** Editing pauses while the connection is down. */
    connected: boolean;
    /** Places the caret at the document's start when it first turns editable. */
    focusOnOpen?: boolean;
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
 * @cc [owner:PopDaph,label:product] collab-editor-editing
 * The editor MUST be editable only when live and connected, and never on a file it cannot open.
 * A live editor MUST edit the shared document only, never save the file. It shows the file's
 * comment threads until the live extensions replace them with the session's; keeping comment marks
 * without a thread is up to the live extensions.
 */
/**
 * @cc [owner:tdraier,label:performance;react] document-edits-render-free
 * A local or remote edit MUST NOT set the hook's state, and MUST NOT make the hook serialize the
 * document; only an `isSavable` call does. Re-rendering with unchanged props MUST NOT hand
 * `useEditor` an option of a new identity, which reapplies every option to the view.
 */
/**
 * @cc [owner:PopDaph,label:product;react] document-caret-on-open
 * With `live.focusOnOpen`, the editor MUST take focus with its caret at the document's start the
 * first time it is editable, unless an input, textarea, select or editable element has focus then.
 * It MUST NOT take focus again afterwards.
 */
export const useDocumentEditor = ({
  initialContent,
  readOnly,
  live,
  resolveImageSource,
}: UseDocumentEditorProps) => {
  const { t } = useLingui();
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
  const editable = !readOnly && initial.isOk() && (live?.connected ?? false);

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
    // Hooks reading the editor's state recompute on transactions, and a document as it mounted
    // sends none they see: TipTap emits `create` a tick later, once they listen.
    onCreate: ({ editor }) => {
      editor.view.dispatch(editor.state.tr);
    },
  });

  // TipTap ignores editable changes passed to useEditor after mount.
  useLayoutEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  const focusOnOpen = live?.focusOnOpen ?? false;
  const openedRef = useRef(false);
  useEffect(() => {
    if (!editor || !editable || !focusOnOpen || openedRef.current) {
      return;
    }
    openedRef.current = true;
    if (!isEditableTarget(document.activeElement)) {
      editor.commands.focus("start");
    }
  }, [editor, editable, focusOnOpen]);

  const isSavable = useCallback(
    (document: JSONContent) =>
      initial.isOk() && saveDfm(initial.value.envelope, document).isOk(),
    [initial]
  );

  return {
    editor,
    editable,
    /** Why the file cannot be edited, with its source, or null when it opened. */
    unsupported,
    /** Whether the document, as TipTap JSON, would save. */
    isSavable,
  };
};
