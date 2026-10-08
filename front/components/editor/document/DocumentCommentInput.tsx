import {
  commentInputExtensions,
  commentMarkdown,
} from "@app/components/editor/document/commentInputExtensions";
import type { DocumentProps } from "@app/components/editor/document/types";
import { EditorContent } from "@app/components/editor/EditorContent";
import type { DfmAuthor } from "@app/lib/markdown/dfm";
import { SUGGESTION_LANGUAGE } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import { ArrowUp, cn, Edit04, Icon, Spinner, Tooltip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { Editor, Extensions } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface DocumentCommentInputProps {
  label: string;
  placeholder: string;
  /** Receives the trimmed Markdown. Ok clears the field; Err keeps the text and shows the reason. */
  onSubmit: (body: string) => Promise<Result<void, string>>;
  /**
   * Handles Escape inside the field, after clearing it, unless a submission is pending. Without it
   * Escape bubbles to the parent.
   */
  onCancel?: () => void;
  /** Told whether the field holds content, each time that changes. */
  onFilledChange?: (filled: boolean) => void;
  author?: DfmAuthor;
  renderAuthorAvatar: DocumentProps["renderCommentAuthorAvatar"];
  /** Focuses the field while true, once it is visible. */
  autoFocus?: boolean;
  onSuggest?: () => Result<string, string>;
  /** Added to the field's editor when it mounts, such as mentions. */
  extensions?: Extensions;
  mountPortalContainer?: HTMLElement;
  className?: string;
}

const NO_EXTENSIONS: Extensions = [];

/** Text, a mention or a code block: line breaks and empty blocks alone are blank. */
const hasContent = (editor: Editor | null) => {
  let found = false;
  editor?.state.doc.descendants((node) => {
    found ||= node.isText
      ? !!node.text?.trim()
      : (node.isAtom && node.type.name !== "hardBreak") ||
        node.type.name === "codeBlock";
    return !found;
  });
  return found;
};

/** Whether a suggestion list opened from the field, such as mentions, is showing. */
const hasOpenSuggestionList = (editor: Editor | null) =>
  !!editor?.state.plugins.some((plugin) => {
    const state: unknown = plugin.getState(editor.state);
    return (
      typeof state === "object" &&
      state !== null &&
      "active" in state &&
      state.active === true
    );
  });

/** Selects the text of the last suggestion block, so typing replaces it; false without one. */
const selectLastSuggestion = (editor: Editor): boolean => {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (
      node.type.name === "codeBlock" &&
      node.attrs.language === SUGGESTION_LANGUAGE
    ) {
      range = { from: pos + 1, to: pos + 1 + node.content.size };
    }
  });
  if (!range) {
    return false;
  }
  editor.commands.setTextSelection(range);
  return true;
};

/**
 * @cc [owner:tdraier,label:react] document-comment-input-suggest
 * With onSuggest, the field MUST offer a Suggest button that appends the suggestion block after
 * the typed content, focuses the field and selects the block's text so typing replaces it. When
 * the content already holds a suggestion block, Suggest MUST append nothing and only focus the
 * field and select the last block's text. A refused suggestion MUST leave the content unchanged and show the reason until the content
 * changes or is submitted. While pending, Suggest MUST NOT change the content.
 */
/**
 * @cc [owner:flvndvd;tdraier,label:react] document-comment-input
 * Enter MUST submit the content as trimmed Markdown, mentions and suggestion blocks included,
 * and Shift+Enter MUST insert a line break, except while an input method is composing text or a
 * mention list is open, and except in a list item, where Enter MUST split the item (see
 * `comment-input-keymap`) and Send MUST still submit. Content without text, a mention or a code block MUST NOT submit, even
 * when line breaks or empty blocks make its Markdown non-empty. While a submission is pending,
 * the content MUST NOT change or submit again, and Send MUST show progress. An accepted submission
 * MUST clear the field; a refused one MUST keep the content and show the reason. Once a submission
 * sent while the field had focus is no longer pending, focus MUST return to the field if it is
 * still mounted. Escape that closes a mention list or arrives while an input method is composing
 * text MUST NOT reach the parent nor clear the field. Otherwise, Escape with onCancel MUST NOT
 * reach the parent and MUST clear the field then call onCancel, unless a submission is pending,
 * when it MUST do neither.
 */
/**
 * @cc [owner:PopDaph,label:react] document-comment-input-filled
 * onFilledChange MUST receive, whenever the content changes, whether it would submit: text, a
 * mention or a code block, as for Send.
 */
export const DocumentCommentInput = ({
  label,
  placeholder,
  onSubmit,
  onCancel,
  onFilledChange,
  author,
  renderAuthorAvatar,
  autoFocus = false,
  onSuggest,
  extensions = NO_EXTENSIONS,
  mountPortalContainer,
  className,
}: DocumentCommentInputProps) => {
  const { t } = useLingui();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [filled, setFilled] = useState(false);
  const pendingRef = useRef(false);
  const refocusRef = useRef(false);
  const submitRef = useRef<() => void>(() => undefined);
  const onFilledChangeRef = useRef(onFilledChange);
  const escapeClosesListRef = useRef(false);

  // Captured at mount: a changed extension list or props object would reconfigure the editor.
  const [options] = useState(() => ({
    extensions: commentInputExtensions({
      placeholder,
      suggestionLabel: t`Suggested change`,
      hostExtensions: extensions,
      onSubmit: submitRef,
    }),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class: cn(
          "max-h-60 min-h-7 overflow-y-auto py-1 text-sm leading-5 wrap-anywhere outline-none",
          "[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0 [&_.is-empty]:before:text-muted-foreground [&_.is-empty]:before:content-[attr(data-placeholder)]"
        ),
      },
    },
  }));
  const editor = useEditor({
    ...options,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setError(null);
      const nowFilled = hasContent(editor);
      setFilled(nowFilled);
      onFilledChangeRef.current?.(nowFilled);
    },
  });

  useLayoutEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.setEditable(!pending, false);
      editor.view.dom.setAttribute("aria-busy", String(pending));
      // Not editable while pending, the field lost focus: give it back once editable again.
      if (!pending && refocusRef.current) {
        refocusRef.current = false;
        editor.commands.focus();
      }
    }
  }, [editor, pending]);

  useEffect(() => {
    if (autoFocus && editor) {
      editor.commands.focus("end");
    }
  }, [autoFocus, editor]);

  const submit = async () => {
    if (!editor || pendingRef.current || !hasContent(editor)) {
      return;
    }
    const body = commentMarkdown(editor);
    refocusRef.current = editor.isFocused;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    let submitted: Result<void, string>;
    try {
      submitted = await onSubmit(body);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
    if (submitted.isErr()) {
      setError(submitted.error);
      return;
    }
    setError(null);
    if (!editor.isDestroyed) {
      editor.commands.clearContent(true);
    }
  };
  useLayoutEffect(() => {
    onFilledChangeRef.current = onFilledChange;
    submitRef.current = () => {
      void submit();
    };
  });

  const suggest = () => {
    if (pending || !editor) {
      return;
    }
    // The button inserts the commented text each time: a second block would repeat it.
    if (selectLastSuggestion(editor)) {
      editor.commands.focus();
      return;
    }
    const block = onSuggest?.();
    if (!block) {
      return;
    }
    if (block.isErr()) {
      setError(block.error);
      return;
    }
    const { doc } = editor.state;
    const last = doc.lastChild;
    const lastIsBlank =
      !!last && last.type.name === "paragraph" && last.content.size === 0;
    const at = lastIsBlank
      ? { from: doc.content.size - last.nodeSize, to: doc.content.size }
      : doc.content.size;
    editor
      .chain()
      .insertContentAt(at, block.value, { contentType: "markdown" })
      .run();
    selectLastSuggestion(editor);
    editor.commands.focus();
  };

  return (
    <div
      role="group"
      className={className}
      onClick={(event) => event.stopPropagation()}
      // Read before the field handles the key: a host dialog prevents every Escape's default, so
      // `defaultPrevented` cannot tell whether the field closed its list.
      onKeyDownCapture={(event) => {
        escapeClosesListRef.current =
          event.key === "Escape" && hasOpenSuggestionList(editor);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") {
          return;
        }
        // The field already used it, such as to close the mention list or end a composition.
        if (escapeClosesListRef.current || event.nativeEvent.isComposing) {
          event.stopPropagation();
          return;
        }
        if (onCancel) {
          event.preventDefault();
          event.stopPropagation();
          if (pending) {
            return;
          }
          editor?.commands.clearContent(true);
          setError(null);
          onCancel();
        }
      }}
    >
      <div className="flex items-start gap-2">
        {author && (
          <span aria-hidden="true" className="mt-1">
            {renderAuthorAvatar(author, "xxs")}
          </span>
        )}
        <EditorContent editor={editor} className="min-w-0 flex-1" />
        {onSuggest && (
          <Tooltip
            label={t`Suggest a change`}
            tooltipTriggerAsChild
            mountPortalContainer={mountPortalContainer}
            trigger={
              <button
                type="button"
                aria-label={t`Suggest a change`}
                aria-disabled={pending}
                onClick={suggest}
                disabled={pending}
                className={cn(
                  "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground motion-reduce:transition-none",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                <Icon visual={Edit04} size="xs" />
              </button>
            }
          />
        )}
        <button
          type="button"
          aria-label={pending ? t`Sending` : t`Send`}
          aria-disabled={pending}
          tabIndex={filled ? 0 : -1}
          onClick={() => void submit()}
          className={cn(
            "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-50 transition-opacity motion-reduce:transition-none",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            filled || pending ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          {pending ? (
            <Spinner size="xs" variant="revert" />
          ) : (
            <Icon visual={ArrowUp} size="xs" />
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="pb-1 text-xs text-warning-500">
          {error}
        </p>
      )}
    </div>
  );
};
