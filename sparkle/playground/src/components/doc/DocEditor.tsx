import { cn } from "@dust-tt/sparkle";
import { Mark, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { docToMarkdown, markdownToHtml } from "./docMarkdown";
import { DOC_TYPOGRAPHY } from "./docTypography";
import { SelectionToolbar } from "./SelectionToolbar";

// MANUAL EDIT — the document as a rich-text editor. Selecting text shows a
// small bar to comment on it or ask the agent to edit it. Comments are marks
// on the text, so they follow it as the user types.

// The editor's document type. Taken from the editor rather than
// "@tiptap/pm/model": the repo has two copies of prosemirror-model, and the
// editor uses the other one.
type PMNode = NonNullable<ReturnType<typeof useEditor>>["state"]["doc"];

// Text an agent just wrote, fading in; removed once the animation is done.
const FadeInMark = Mark.create({
  name: "fadeIn",
  inclusive: false,
  excludes: "",
  parseHTML: () => [],
  renderHTML: () => ["span", { class: "doc-fade-in" }, 0],
});

const CommentMark = Mark.create({
  name: "comment",
  // Outermost of the marks, so a passage spanning bold or links stays one
  // element (a suggestion's new text is drawn once, after it).
  priority: 1000,
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => ({ "data-comment-id": attributes.id }),
      },
      // A pending suggestion's new text; the passage shows it inline.
      suggestion: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-suggestion"),
        renderHTML: (attributes) =>
          attributes.suggestion === null
            ? {}
            : { "data-suggestion": attributes.suggestion },
      },
      // The suggestion adds text after this passage, which it keeps.
      suggestionInsert: {
        default: false,
        parseHTML: (element) => element.hasAttribute("data-suggestion-insert"),
        renderHTML: (attributes) =>
          attributes.suggestionInsert ? { "data-suggestion-insert": "" } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "doc-comment-mark" }),
      0,
    ];
  },
});

/** Range of `text` in the document, matched across text nodes. */
function findTextRange(
  doc: PMNode,
  text: string
): { from: number; to: number } | null {
  if (!text) return null;
  let joined = "";
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) positions.push(pos + i);
      joined += node.text;
    }
  });
  const index = joined.indexOf(text);
  if (index === -1) return null;
  return { from: positions[index], to: positions[index + text.length - 1] + 1 };
}

function findCommentRange(
  doc: PMNode,
  commentId: string
): { from: number; to: number } | null {
  let range: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (
      node.isText &&
      node.marks.some(
        (m) => m.type.name === "comment" && m.attrs.id === commentId
      )
    ) {
      range = {
        from: Math.min(range?.from ?? pos, pos),
        to: Math.max(range?.to ?? 0, pos + node.nodeSize),
      };
    }
  });
  return range;
}

export interface DocEditorHandle {
  /** The editor's view (positions ↔ screen coordinates, transactions). */
  getView: () => NonNullable<ReturnType<typeof useEditor>>["view"] | null;
  /** Puts the cursor at the end of the document. */
  focusEnd: () => void;
  getSelectionText: () => string;
  /** Anchors comment `id` on the current selection; returns the quoted text. */
  addComment: (id: string) => string | null;
  removeComment: (id: string) => void;
  focusComment: (id: string) => void;
  /** Where comment `id` is anchored. */
  getCommentRange: (id: string) => { from: number; to: number } | null;
  /** Replaces the content, re-anchoring comments whose quote still exists. */
  setMarkdown: (
    markdown: string,
    comments: Array<{ id: string; quote: string; suggestion?: string }>
  ) => void;
}

interface DocEditorProps {
  initialMarkdown: string;
  initialJson: Record<string, unknown> | null;
  activeCommentId: string | null;
  /** Comment style "light": softer highlights, no underline. */
  lightHighlights?: boolean;
  /** Comments to anchor on their quote when the editor first opens. */
  initialAnchors?: Array<{ id: string; quote: string }>;
  /** `markdown` is null when only comment highlights changed, not the text. */
  onChange: (value: {
    markdown: string | null;
    json: Record<string, unknown>;
  }) => void;
  onCommentSelection: () => void;
  /** "Suggest edit" on the selection (read-only documents). */
  onSuggestSelection: () => void;
  /**
   * The viewer can't edit: typing, pasting and formatting are ignored, but
   * text can still be selected to comment on or suggest an edit.
   */
  readOnly?: boolean;
  /** Called with the clicked comment, or null for a click elsewhere. */
  onCommentClick: (commentId: string | null) => void;
}

export const DocEditor = forwardRef<DocEditorHandle, DocEditorProps>(
  (
    {
      initialMarkdown,
      initialJson,
      activeCommentId,
      lightHighlights = false,
      initialAnchors,
      onChange,
      onCommentSelection,
      onSuggestSelection,
      readOnly = false,
      onCommentClick,
    },
    ref
  ) => {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onCommentClickRef = useRef(onCommentClick);
    onCommentClickRef.current = onCommentClick;
    const readOnlyRef = useRef(readOnly);
    readOnlyRef.current = readOnly;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({ link: { openOnClick: false } }),
        CommentMark,
        FadeInMark,
      ],
      content: initialJson ?? markdownToHtml(initialMarkdown),
      editorProps: {
        attributes: { class: "outline-hidden min-h-full" },
        handleClick: (view, pos) => {
          const comment = view.state.doc
            .resolve(pos)
            .marks()
            .find((m) => m.type.name === "comment");
          onCommentClickRef.current(comment?.attrs.id ?? null);
          return false;
        },
        // Read-only, the editor stays focusable so text can be selected (the
        // selection bar needs it), but anything that would change the text
        // is swallowed. Moving around and copying still work.
        handleKeyDown: (_view, event) => {
          if (!readOnlyRef.current) return false;
          const moves =
            /^(Arrow|Page|Home|End|Escape|Tab|Shift|Alt|Meta|Control)/.test(
              event.key
            ) ||
            ((event.metaKey || event.ctrlKey) && /^[ac]$/i.test(event.key));
          return !moves;
        },
        handleTextInput: () => readOnlyRef.current,
        handlePaste: () => readOnlyRef.current,
        handleDrop: () => readOnlyRef.current,
        handleDOMEvents: {
          beforeinput: (_view, event) => {
            if (!readOnlyRef.current) return false;
            event.preventDefault();
            return true;
          },
        },
      },
      onUpdate: ({ editor: e, transaction }) => {
        // An agent edit being replayed on screen; its result is already saved.
        if (transaction.getMeta("agentEditReplay")) return;
        const onlyCommentMarks = transaction.steps.every((step) => {
          const json = step.toJSON();
          return (
            (json.stepType === "addMark" || json.stepType === "removeMark") &&
            json.mark?.type === "comment"
          );
        });
        onChangeRef.current({
          markdown: onlyCommentMarks ? null : docToMarkdown(e.state.doc),
          json: e.getJSON(),
        });
      },
    });

    const hasAnchored = useRef(false);
    useEffect(() => {
      if (!editor || hasAnchored.current || !initialAnchors?.length) return;
      hasAnchored.current = true;
      const chain = editor.chain();
      for (const anchor of initialAnchors) {
        const range = findTextRange(editor.state.doc, anchor.quote);
        if (range) {
          chain.setTextSelection(range).setMark("comment", { id: anchor.id });
        }
      }
      chain.setTextSelection(0).run();
    }, [editor, initialAnchors]);

    useImperativeHandle(
      ref,
      () => ({
        getView: () => editor?.view ?? null,
        focusEnd: () => {
          editor?.commands.focus("end");
        },
        getSelectionText: () => {
          if (!editor) return "";
          const { from, to } = editor.state.selection;
          return editor.state.doc.textBetween(from, to, "\n");
        },
        addComment: (id) => {
          if (!editor) return null;
          const { from, to } = editor.state.selection;
          if (from === to) return null;
          const quote = editor.state.doc.textBetween(from, to, "\n");
          // Collapse the selection: the comment takes over, so the
          // selection bar (Comment / Ask agent) shouldn't linger.
          editor.chain().setMark("comment", { id }).setTextSelection(to).run();
          return quote;
        },
        removeComment: (id) => {
          if (!editor) return;
          const range = findCommentRange(editor.state.doc, id);
          if (range) {
            editor
              .chain()
              .setTextSelection(range)
              .unsetMark("comment")
              .setTextSelection(range.to)
              .run();
          }
        },
        getCommentRange: (id) =>
          editor ? findCommentRange(editor.state.doc, id) : null,
        focusComment: (id) => {
          if (!editor) return;
          const range = findCommentRange(editor.state.doc, id);
          if (!range) return;
          editor.chain().setTextSelection(range.from).run();
          // ProseMirror's own scrollIntoView doesn't move the panel's scroll
          // area here; scroll the highlight itself into the middle of it.
          editor.view.dom
            .querySelector(`[data-comment-id="${CSS.escape(id)}"]`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
        },
        setMarkdown: (markdown, comments) => {
          if (!editor) return;
          editor.commands.setContent(markdownToHtml(markdown), {
            emitUpdate: false,
          });
          for (const comment of comments) {
            const range = findTextRange(editor.state.doc, comment.quote);
            if (range) {
              editor
                .chain()
                .setTextSelection(range)
                .setMark("comment", {
                  id: comment.id,
                  suggestion: comment.suggestion ?? null,
                })
                .run();
            }
          }
          editor.commands.setTextSelection(0);
          onChangeRef.current({
            markdown: docToMarkdown(editor.state.doc),
            json: editor.getJSON(),
          });
        },
      }),
      [editor]
    );

    if (!editor) return null;

    return (
      <div
        className={cn(
          "doc-editor",
          DOC_TYPOGRAPHY,
          "[&_.doc-comment-mark]:cursor-pointer [&_.doc-comment-mark]:rounded-sm",
          lightHighlights
            ? "[&_.doc-comment-mark]:bg-golden-100/70"
            : "[&_.doc-comment-mark]:bg-golden-100 [&_.doc-comment-mark]:border-b-2 [&_.doc-comment-mark]:border-golden-300"
        )}
      >
        {activeCommentId && (
          // The active comment's anchor is emphasised; its id is dynamic, so
          // this can't be a static utility class.
          <style>{`.doc-editor [data-comment-id="${CSS.escape(activeCommentId)}"] { background-color: var(${lightHighlights ? "--color-golden-200" : "--color-golden-300"}); }`}</style>
        )}
        <BubbleMenu
          editor={editor}
          shouldShow={({ state }) => !state.selection.empty}
          options={{ placement: "top", offset: 8 }}
        >
          <SelectionToolbar
            editor={editor}
            readOnly={readOnly}
            onComment={onCommentSelection}
            onSuggest={onSuggestSelection}
          />
        </BubbleMenu>
        <EditorContent editor={editor} />
      </div>
    );
  }
);

DocEditor.displayName = "DocEditor";
