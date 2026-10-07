import { SUGGESTION_LANGUAGE, suggestionBlock } from "@app/lib/markdown/dfm";
import type { Editor, Extensions, JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import type { RefObject } from "react";

const textOf = (content: JSONContent[] | undefined) =>
  (content ?? []).map((child) => child.text ?? "").join("");

/**
 * @cc [owner:tdraier,label:product] comment-suggestion-code-block
 * A code block whose language is `suggestion` MUST be written as `suggestionBlock` of its
 * text, so it reads back through `readMessageSuggestions` as that text whatever backticks it
 * contains, and MUST show as a suggested change rather than as code.
 */
const CommentCodeBlock = CodeBlock.extend({
  renderHTML({ node, HTMLAttributes }) {
    if (node.attrs.language !== SUGGESTION_LANGUAGE) {
      return [
        "pre",
        {
          ...HTMLAttributes,
          class:
            "my-1 overflow-x-auto rounded-md border border-border bg-muted-background px-2 py-1 font-mono text-xs",
        },
        ["code", 0],
      ];
    }
    return [
      "div",
      {
        "data-comment-suggestion": "",
        class:
          "my-1 flex flex-col overflow-hidden rounded-lg border border-border",
      },
      [
        "div",
        {
          contenteditable: "false",
          class:
            "select-none border-b border-border bg-muted-background px-2 py-1 text-xs font-medium text-muted-foreground",
        },
        "Suggested change",
      ],
      [
        "pre",
        {
          class:
            "whitespace-pre-wrap bg-success-100/60 px-2 py-1 font-sans wrap-anywhere dark:bg-success-500/20 [&>code]:font-sans",
        },
        ["code", 0],
      ],
    ];
  },
  renderMarkdown: (node) => {
    const text = textOf(node.content);
    const language = node.attrs?.language ?? "";
    if (language === SUGGESTION_LANGUAGE) {
      const block = suggestionBlock(text);
      if (block.isOk()) {
        return block.value;
      }
    }
    const longestRun = Math.max(
      0,
      ...(text.match(/`+/g) ?? []).map((run) => run.length)
    );
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    return `${fence}${language}\n${text}\n${fence}`;
  },
});

// A backslash break leaves no trailing spaces in the message body, which signs as written.
const CommentHardBreak = HardBreak.extend({
  renderMarkdown: () => "\\\n",
});

const isBlockEnd = (node: JSONContent) =>
  node.type === "hardBreak" ||
  (node.type === "text" && !node.marks?.length && !node.text?.trim());

const withoutTrailingBreaks = (node: JSONContent): JSONContent => {
  if (!node.content || node.type === "codeBlock") {
    return node;
  }
  const content = node.content.map(withoutTrailingBreaks);
  while (content.length > 0 && isBlockEnd(content[content.length - 1])) {
    content.pop();
  }
  return { ...node, content };
};

/**
 * @cc [owner:tdraier,label:product] comment-markdown-no-trailing-break
 * The returned Markdown MUST be trimmed and MUST NOT write a line break at the end of a block
 * outside code blocks, where Markdown would show it as a literal backslash.
 */
export const commentMarkdown = (editor: Editor) =>
  (
    editor.markdown?.serialize(withoutTrailingBreaks(editor.getJSON())) ?? ""
  ).trim();

interface CommentKeymapOptions {
  onSubmit: RefObject<() => void>;
}

/**
 * @cc [owner:tdraier,label:react] comment-input-keymap
 * Enter MUST submit, unless an extension of higher priority, such as an open mention list,
 * handles it first. Shift+Enter MUST insert a line break, inside a code block too, and MUST NOT
 * leave the block.
 */
const CommentKeymap = Extension.create<CommentKeymapOptions>({
  name: "commentKeymap",

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        this.options.onSubmit.current?.();
        return true;
      },
      "Shift-Enter": () =>
        this.editor.isActive("codeBlock")
          ? this.editor.commands.newlineInCode()
          : this.editor.commands.setHardBreak(),
    };
  },
});

interface CommentInputExtensionsParams extends CommentKeymapOptions {
  placeholder: string;
  hostExtensions: Extensions;
}

export const commentInputExtensions = ({
  placeholder,
  hostExtensions,
  onSubmit,
}: CommentInputExtensionsParams): Extensions => [
  StarterKit.configure({
    codeBlock: false,
    hardBreak: false,
    heading: false,
    horizontalRule: false,
    underline: false,
    link: { openOnClick: false, autolink: false },
    paragraph: { HTMLAttributes: { class: "my-0" } },
    bold: { HTMLAttributes: { class: "font-semibold" } },
    bulletList: { HTMLAttributes: { class: "list-disc pl-5" } },
    orderedList: { HTMLAttributes: { class: "list-decimal pl-5" } },
    blockquote: {
      HTMLAttributes: { class: "border-l-2 border-foreground/30 pl-2" },
    },
    code: {
      HTMLAttributes: {
        class:
          "rounded border border-border bg-muted-background px-1 font-mono text-[0.85em]",
      },
    },
  }),
  CommentCodeBlock,
  CommentHardBreak,
  Markdown,
  Placeholder.configure({ placeholder }),
  ...hostExtensions,
  CommentKeymap.configure({ onSubmit }),
];
