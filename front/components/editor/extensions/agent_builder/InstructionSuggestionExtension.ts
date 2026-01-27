import type { JSONContent } from "@tiptap/core";
import { Extension, Mark } from "@tiptap/core";
import { EditorState, Transaction } from "@tiptap/pm/state";
import type { Change } from "diff";
import { diffWords } from "diff";

// Mark for additions (blue background).
export const SuggestionAdditionMark = Mark.create({
  name: "suggestionAddition",

  addAttributes() {
    return {
      suggestionId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.suggestion-addition" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        ...HTMLAttributes,
        class:
          "suggestion-addition s-rounded s-bg-highlight-100 dark:s-bg-highlight-100-night s-text-highlight-800",
        "data-suggestion-id": HTMLAttributes.suggestionId,
      },
      0,
    ];
  },
});

// Mark for deletions (red background + strikethrough).
export const SuggestionDeletionMark = Mark.create({
  name: "suggestionDeletion",

  addAttributes() {
    return {
      suggestionId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.suggestion-deletion" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        ...HTMLAttributes,
        class:
          "suggestion-deletion s-rounded s-bg-warning-100 dark:s-bg-warning-100-night s-text-warning-800 s-line-through",
        "data-suggestion-id": HTMLAttributes.suggestionId,
      },
      0,
    ];
  },
});

export interface SuggestionMatch {
  start: number;
  end: number;
}

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

/**
 * Gets the committed text content from the editor, excluding suggestion marks.
 * This returns the text as it would be without any pending suggestions.
 */
export function getCommittedTextContent(editor: {
  getJSON: () => JSONContent;
}): string {
  const json = editor.getJSON();

  return extractCommittedText(json);
}

function extractCommittedText(node: JSONContent): string {
  if (node.type === "text") {
    // Addition marks are suggested additions not yet accepted, exclude them.
    // All other text (including deletion marks which are original text) is included.
    const hasAdditionMark = node.marks?.some(
      (mark) => mark.type === "suggestionAddition"
    );

    return hasAdditionMark ? "" : (node.text ?? "");
  }

  if (node.content) {
    const childText = node.content.map(extractCommittedText).join("");

    // Add appropriate spacing for block-level elements.
    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "bulletList" ||
      node.type === "orderedList"
    ) {
      return childText + "\n\n";
    }
    if (node.type === "listItem") {
      return "- " + childText + "\n";
    }

    return childText;
  }

  return "";
}

export const InstructionSuggestionExtension = Extension.create({
  name: "instructionSuggestion",

  addStorage() {
    return {
      activeSuggestionIds: [] as string[],
    };
  },

  addExtensions() {
    return [SuggestionAdditionMark, SuggestionDeletionMark];
  },

  addCommands() {
    return {
      applySuggestion:
        (options: ApplySuggestionOptions) =>
        ({ editor }) => {
          const { id, find, replacement } = options;
          const markdown = editor.getMarkdown();

          // Find all occurrences of the find text.
          const matches: SuggestionMatch[] = [];
          let searchStart = 0;
          let index = markdown.indexOf(find, searchStart);

          while (index !== -1) {
            matches.push({
              start: index,
              end: index + find.length,
            });
            searchStart = index + 1;
            index = markdown.indexOf(find, searchStart);
          }

          if (matches.length === 0) {
            return false;
          }

          // Build new content with diff marks.
          const diffParts = diffWords(find, replacement);
          const diffContent = buildSuggestionDiffContent(diffParts, id);

          // For now, we'll apply to the first match only.
          // In a more complex implementation, we'd handle multiple matches.
          const match = matches[0];

          // Get the text before and after the match.
          const beforeText = markdown.substring(0, match.start);
          const afterText = markdown.substring(match.end);

          // Build the complete new content.
          const newContent = buildNewContent(
            beforeText,
            afterText,
            diffContent
          );

          // Set the new content.
          editor.commands.setContent(newContent);

          // Track this suggestion.
          this.storage.activeSuggestionIds.push(id);

          return true;
        },

      acceptSuggestion:
        (suggestionId: string) =>
        ({ state, tr }) => {
          // Accept: remove deletions (old text), keep additions (new text) without marks.
          const modified = processSuggestionMarks(state, tr, suggestionId, {
            markToDelete: "suggestionDeletion",
            markToKeep: "suggestionAddition",
          });

          if (modified) {
            this.storage.activeSuggestionIds =
              this.storage.activeSuggestionIds.filter(
                (id: string) => id !== suggestionId
              );
          }

          return modified;
        },

      rejectSuggestion:
        (suggestionId: string) =>
        ({ state, tr }) => {
          // Reject: remove additions (new text), keep deletions (old text) without marks.
          const modified = processSuggestionMarks(state, tr, suggestionId, {
            markToDelete: "suggestionAddition",
            markToKeep: "suggestionDeletion",
          });

          if (modified) {
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

interface SuggestionMarkConfig {
  markToDelete: "suggestionDeletion" | "suggestionAddition";
  markToKeep: "suggestionDeletion" | "suggestionAddition";
}

// Processes suggestion marks for accept/reject operations.
// Deletes text with markToDelete, removes markToKeep from text while keeping the text.
function processSuggestionMarks(
  state: EditorState,
  tr: Transaction,
  suggestionId: string,
  config: SuggestionMarkConfig
): boolean {
  const { doc, schema } = state;
  let modified = false;

  doc.descendants((node, pos) => {
    if (!node.isText || node.marks.length === 0) {
      return;
    }

    const matchingMark = node.marks.find(
      (mark) =>
        (mark.type.name === "suggestionDeletion" ||
          mark.type.name === "suggestionAddition") &&
        mark.attrs.suggestionId === suggestionId
    );

    if (!matchingMark) {
      return;
    }

    const markTypeName = matchingMark.type.name;
    if (markTypeName === config.markToDelete) {
      tr.delete(pos, pos + node.nodeSize);
      modified = true;
    } else if (markTypeName === config.markToKeep) {
      tr.removeMark(pos, pos + node.nodeSize, schema.marks[config.markToKeep]);
      modified = true;
    }
  });

  return modified;
}

// Builds diff content with suggestion marks.
function buildSuggestionDiffContent(
  diffParts: Change[],
  suggestionId: string
): JSONContent[] {
  return diffParts.map((part) => {
    const node: JSONContent = {
      type: "text",
      text: part.value,
    };

    if (part.added) {
      node.marks = [
        { type: "suggestionAddition", attrs: { suggestionId } },
      ];
    } else if (part.removed) {
      node.marks = [
        { type: "suggestionDeletion", attrs: { suggestionId } },
      ];
    }

    return node;
  });
}

// Builds new content with suggestion marks.
function buildNewContent(
  beforeText: string,
  afterText: string,
  diffContent: JSONContent[]
): JSONContent {
  const content: JSONContent[] = [];

  if (beforeText) {
    content.push({
      type: "text",
      text: beforeText,
    });
  }

  content.push(...diffContent);

  if (afterText) {
    content.push({
      type: "text",
      text: afterText,
    });
  }

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content,
      },
    ],
  };
}
