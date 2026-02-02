import type { Editor, JSONContent } from "@tiptap/core";
import { Extension, Node } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";

// --- Types ---

export interface ApplySuggestionOptions {
  id: string;
  find: string;
  replacement: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    instructionSuggestion: {
      applySuggestion: (options: ApplySuggestionOptions) => ReturnType;
      acceptSuggestion: (suggestionId: string) => ReturnType;
      rejectSuggestion: (suggestionId: string) => ReturnType;
      acceptAllSuggestions: () => ReturnType;
      rejectAllSuggestions: () => ReturnType;
    };
  }

  interface Storage {
    instructionSuggestion: {
      activeSuggestionIds: string[];
    };
  }
}

// --- Escape Sequences ---
// Used to preserve special characters in suggestion content during markdown parsing.

const NEWLINE_ESCAPE = "⏎";
const OPEN_BRACKET_ESCAPE = "⟦";
const CLOSE_BRACKET_ESCAPE = "⟧";
const CLOSING_TAG_SLASH_ESCAPE = "⁄";
const ZERO_WIDTH_NON_JOINER = "\u200C";

function escapeForSuggestion(text: string): string {
  return text
    .replace(/\n/g, NEWLINE_ESCAPE)
    .replace(/\[/g, OPEN_BRACKET_ESCAPE)
    .replace(/\]\{/g, CLOSE_BRACKET_ESCAPE + "{")
    .replace(/<\//g, "<" + CLOSING_TAG_SLASH_ESCAPE);
}

function unescapeFromSuggestion(text: string): string {
  return text
    .split(CLOSE_BRACKET_ESCAPE)
    .join("]")
    .split(OPEN_BRACKET_ESCAPE)
    .join("[")
    .split("<" + CLOSING_TAG_SLASH_ESCAPE)
    .join("</")
    .split(NEWLINE_ESCAPE)
    .join("\n");
}

// --- Helper Functions ---

function getSuggestionLabel(suggestionId: string): string {
  return suggestionId.slice(-4);
}

const CLOSING_TAG_ONLY_REGEX = /^<\/([A-Za-z_][A-Za-z0-9._:-]*)>$/;

function escapeOpeningTagInBefore(before: string, tagName: string): string {
  const target = `<${tagName}>`;
  const idx = before.lastIndexOf(target);
  if (idx === -1) {
    return before;
  }
  const escaped = `<${ZERO_WIDTH_NON_JOINER}${tagName}>`;
  return before.slice(0, idx) + escaped + before.slice(idx + target.length);
}

function stripZeroWidthNonJoiners(editor: Editor): void {
  const { doc, tr, schema } = editor.state;
  const operations: Array<{ pos: number; nodeSize: number; text: string }> = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text?.includes(ZERO_WIDTH_NON_JOINER)) {
      return true;
    }
    const text = node.text.replace(new RegExp(ZERO_WIDTH_NON_JOINER, "g"), "");
    if (text.length > 0) {
      operations.push({ pos, nodeSize: node.nodeSize, text });
    }
    return true;
  });

  if (operations.length === 0) {
    return;
  }

  operations.sort((a, b) => b.pos - a.pos);
  for (const op of operations) {
    tr.replaceWith(op.pos, op.pos + op.nodeSize, schema.text(op.text));
  }

  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

function filterOutAdditions(node: JSONContent): JSONContent {
  if (node.type === "suggestionAddition") {
    return { type: "text", text: "" };
  }

  if (node.content) {
    return {
      ...node,
      content: node.content
        .map(filterOutAdditions)
        .filter((n) => !(n.type === "text" && n.text === "")),
    };
  }

  return node;
}

// --- Suggestion Nodes ---

export const SuggestionAdditionNode = Node.create({
  name: "suggestionAddition",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      suggestionId: { default: null },
      text: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span.suggestion-addition",
        getAttrs: (element) => {
          if (typeof element === "string") {
            return false;
          }
          return {
            suggestionId: element.getAttribute("data-suggestion-id"),
            text: element.textContent ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const label = getSuggestionLabel(node.attrs.suggestionId);
    const text = node.attrs.text ?? "";
    return [
      "span",
      {
        class:
          "suggestion-addition s-rounded s-bg-highlight-100 dark:s-bg-highlight-100-night s-text-highlight-800",
        "data-suggestion-id": node.attrs.suggestionId,
        title: `Suggestion: ${node.attrs.suggestionId}`,
        contenteditable: "false",
      },
      ["span", {}, text],
      [
        "sup",
        {
          class:
            "s-ml-0.5 s-text-[9px] s-font-mono s-text-highlight-500 s-select-none",
        },
        label,
      ],
    ];
  },

  markdownTokenizer: {
    name: "suggestionAddition",
    level: "inline",
    start: (src: string) => src.indexOf(":suggestion_addition"),
    tokenize: (src: string) => {
      const regex = /^:suggestion_addition\[([\s\S]*?)\]\{id=([^}]+)\}/;
      const match = regex.exec(src);
      if (!match) {
        return undefined;
      }
      return {
        type: "suggestionAddition",
        raw: match[0],
        text: match[1],
        suggestionId: match[2],
      };
    },
  },

  parseMarkdown: (token: { text?: string; suggestionId?: string }) => {
    const text = unescapeFromSuggestion(token.text ?? "");
    return {
      type: "suggestionAddition",
      attrs: {
        suggestionId: token.suggestionId,
        text,
      },
    };
  },

  renderMarkdown: (node: { attrs?: { text?: string; suggestionId?: string } }) => {
    const text = node.attrs?.text ?? "";
    const suggestionId = node.attrs?.suggestionId ?? "";
    const escapedText = escapeForSuggestion(text);
    return `:suggestion_addition[${escapedText}]{id=${suggestionId}}`;
  },
});

export const SuggestionDeletionNode = Node.create({
  name: "suggestionDeletion",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      suggestionId: { default: null },
      text: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span.suggestion-deletion",
        getAttrs: (element) => {
          if (typeof element === "string") {
            return false;
          }
          return {
            suggestionId: element.getAttribute("data-suggestion-id"),
            text: element.textContent ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const label = getSuggestionLabel(node.attrs.suggestionId);
    const text = node.attrs.text ?? "";
    return [
      "span",
      {
        class:
          "suggestion-deletion s-rounded s-bg-warning-100 dark:s-bg-warning-100-night s-text-warning-800 s-line-through",
        "data-suggestion-id": node.attrs.suggestionId,
        title: `Suggestion: ${node.attrs.suggestionId}`,
        contenteditable: "false",
      },
      ["span", {}, text],
      [
        "sup",
        {
          class:
            "s-ml-0.5 s-text-[9px] s-font-mono s-text-warning-500 s-select-none s-no-underline",
          style: "text-decoration: none;",
        },
        label,
      ],
    ];
  },

  markdownTokenizer: {
    name: "suggestionDeletion",
    level: "inline",
    start: (src: string) => src.indexOf(":suggestion_deletion"),
    tokenize: (src: string) => {
      const regex = /^:suggestion_deletion\[([\s\S]*?)\]\{id=([^}]+)\}/;
      const match = regex.exec(src);
      if (!match) {
        return undefined;
      }
      return {
        type: "suggestionDeletion",
        raw: match[0],
        text: match[1],
        suggestionId: match[2],
      };
    },
  },

  parseMarkdown: (token: { text?: string; suggestionId?: string }) => {
    const text = unescapeFromSuggestion(token.text ?? "");
    return {
      type: "suggestionDeletion",
      attrs: {
        suggestionId: token.suggestionId,
        text,
      },
    };
  },

  renderMarkdown: (node: { attrs?: { text?: string; suggestionId?: string } }) => {
    const text = node.attrs?.text ?? "";
    const suggestionId = node.attrs?.suggestionId ?? "";
    const escapedText = escapeForSuggestion(text);
    return `:suggestion_deletion[${escapedText}]{id=${suggestionId}}`;
  },
});

// --- Public Functions ---

/**
 * Get the committed text content from the editor, excluding pending additions.
 * This returns the text as it would appear if all suggestions were rejected.
 */
export function getCommittedTextContent(editor: {
  getJSON: () => JSONContent;
  markdown?: Editor["markdown"];
}): string {
  const json = editor.getJSON();
  const filteredJson = filterOutAdditions(json);

  if (!editor.markdown) {
    throw new Error("Markdown extension not found");
  }

  return editor.markdown.serialize(filteredJson);
}

/**
 * Apply a suggestion to the editor by finding and marking text changes.
 * Uses markdown string manipulation with custom tokenizers for proper structure handling.
 */
export function applySuggestion(
  editor: Editor,
  options: ApplySuggestionOptions
): boolean {
  const { id, find, replacement } = options;

  const currentMarkdown = editor.getMarkdown();
  const normalizedFind = find.replace(/\s+$/, "");
  const normalizedReplacement = replacement.replace(/\s+$/, "");

  const findIndex = currentMarkdown.indexOf(normalizedFind);
  if (findIndex === -1) {
    return false;
  }

  const escapedFind = escapeForSuggestion(normalizedFind);
  const escapedReplacement = escapeForSuggestion(normalizedReplacement);

  let before = currentMarkdown.substring(0, findIndex);
  const after = currentMarkdown.substring(findIndex + normalizedFind.length);

  // If deleting a closing tag, escape the matching opening tag to prevent
  // the instructionBlock tokenizer from consuming it during re-parse.
  const closingTagMatch = normalizedFind.match(CLOSING_TAG_ONLY_REGEX);
  if (closingTagMatch) {
    const tagName = closingTagMatch[1];
    before = escapeOpeningTagInBefore(before, tagName);
  }

  const newMarkdown =
    before +
    `:suggestion_deletion[${escapedFind}]{id=${id}}` +
    `:suggestion_addition[${escapedReplacement}]{id=${id}}` +
    after;

  editor.commands.setContent(newMarkdown, {
    emitUpdate: false,
    contentType: "markdown",
  });

  if (closingTagMatch) {
    stripZeroWidthNonJoiners(editor);
  }

  if (editor.storage.instructionSuggestion) {
    editor.storage.instructionSuggestion.activeSuggestionIds.push(id);
  }

  return true;
}

// --- Extension ---

export const InstructionSuggestionExtension = Extension.create({
  name: "instructionSuggestion",

  addStorage() {
    return {
      activeSuggestionIds: [] as string[],
    };
  },

  addExtensions() {
    return [SuggestionAdditionNode, SuggestionDeletionNode];
  },

  addCommands() {
    return {
      applySuggestion:
        (options: ApplySuggestionOptions) =>
        ({ editor }) => {
          return applySuggestion(editor as Editor, options);
        },

      acceptSuggestion:
        (suggestionId: string) =>
        ({ state, tr, dispatch }) => {
          const modified = processSuggestionNodes(state, tr, suggestionId, {
            nodeToDelete: "suggestionDeletion",
            nodeToKeep: "suggestionAddition",
          });

          if (modified && dispatch) {
            dispatch(tr);
            this.storage.activeSuggestionIds =
              this.storage.activeSuggestionIds.filter(
                (id: string) => id !== suggestionId
              );
          }

          return modified;
        },

      rejectSuggestion:
        (suggestionId: string) =>
        ({ state, tr, dispatch }) => {
          const modified = processSuggestionNodes(state, tr, suggestionId, {
            nodeToDelete: "suggestionAddition",
            nodeToKeep: "suggestionDeletion",
          });

          if (modified && dispatch) {
            dispatch(tr);
            this.storage.activeSuggestionIds =
              this.storage.activeSuggestionIds.filter(
                (id: string) => id !== suggestionId
              );
          }

          return modified;
        },

      acceptAllSuggestions:
        () =>
        ({ commands }) => {
          const suggestionIds = [...this.storage.activeSuggestionIds];
          return suggestionIds.every((id) => commands.acceptSuggestion(id));
        },

      rejectAllSuggestions:
        () =>
        ({ commands }) => {
          const suggestionIds = [...this.storage.activeSuggestionIds];
          return suggestionIds.every((id) => commands.rejectSuggestion(id));
        },
    };
  },
});

// --- Node Processing ---

interface SuggestionNodeConfig {
  nodeToDelete: "suggestionDeletion" | "suggestionAddition";
  nodeToKeep: "suggestionDeletion" | "suggestionAddition";
}

interface SuggestionOperation {
  type: "delete" | "unwrap";
  pos: number;
  nodeSize: number;
}

function processSuggestionNodes(
  state: EditorState,
  tr: Transaction,
  suggestionId: string,
  config: SuggestionNodeConfig
): boolean {
  const { doc } = state;
  const operations: SuggestionOperation[] = [];

  doc.descendants((node, pos) => {
    if (
      node.type.name !== "suggestionDeletion" &&
      node.type.name !== "suggestionAddition"
    ) {
      return;
    }

    if (node.attrs.suggestionId !== suggestionId) {
      return;
    }

    if (node.type.name === config.nodeToDelete) {
      operations.push({ type: "delete", pos, nodeSize: node.nodeSize });
    } else if (node.type.name === config.nodeToKeep) {
      operations.push({ type: "unwrap", pos, nodeSize: node.nodeSize });
    }
  });

  if (operations.length === 0) {
    return false;
  }

  // Process from end to start to avoid position shifts
  operations.sort((a, b) => b.pos - a.pos);

  for (const op of operations) {
    if (op.type === "delete") {
      tr.delete(op.pos, op.pos + op.nodeSize);
    } else {
      const node = tr.doc.nodeAt(op.pos);
      if (node) {
        const textContent = node.attrs.text ?? "";
        if (textContent) {
          tr.replaceWith(
            op.pos,
            op.pos + op.nodeSize,
            state.schema.text(textContent)
          );
        } else {
          tr.delete(op.pos, op.pos + op.nodeSize);
        }
      }
    }
  }

  return true;
}
