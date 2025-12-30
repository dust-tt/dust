import type { NodeViewProps } from "@tiptap/core";
import type { MentionOptions } from "@tiptap/extension-mention";
import Mention from "@tiptap/extension-mention";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { MentionComponent } from "@app/components/editor/input_bar/MentionComponent";
import { clientFetch } from "@app/lib/egress/client";
import {
  AGENT_MENTION_REGEX_BEGINNING,
  USER_MENTION_REGEX_BEGINNING,
} from "@app/lib/mentions/format";
import logger from "@app/logger/logger";
import type { WorkspaceType } from "@app/types";

interface MentionExtensionOptions extends MentionOptions {
  owner: WorkspaceType;
}

export const MentionExtension = Mention.extend<MentionExtensionOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      owner: {} as WorkspaceType,
    } as MentionExtensionOptions;
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      type: {
        default: "agent",
        parseHTML: (element) => element.getAttribute("data-type"),
        renderHTML: (attributes) => {
          if (!attributes.type) {
            return {};
          }
          return {
            "data-type": attributes.type,
          };
        },
      },
      description: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-description"),
        renderHTML: (attributes) => {
          if (!attributes.description) {
            return {};
          }
          return {
            "data-description": attributes.description,
          };
        },
      },
      pictureUrl: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-picture-url"),
        renderHTML: (attributes) => {
          if (!attributes.pictureUrl) {
            return {};
          }
          return {
            "data-picture-url": attributes.pictureUrl,
          };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => (
      <MentionComponent
        node={{
          attrs: props.node.attrs as {
            type: "agent" | "user";
            id: string;
            label: string;
            description?: string;
            pictureUrl?: string;
          },
        }}
        owner={this.options.owner}
      />
    ));
  },

  // define a custom Markdown tokenizer to recognize :mention: syntax
  markdownTokenizer: {
    name: "mention",
    level: "inline", // inline element
    // fast hint for the lexer to find candidate positions
    start: (src) => src.indexOf(":mention"),
    tokenize: (src) => {
      const matchAgent = AGENT_MENTION_REGEX_BEGINNING.exec(src);
      const matchUser = USER_MENTION_REGEX_BEGINNING.exec(src);
      if (!matchAgent && !matchUser) {
        return undefined;
      }

      if (matchAgent) {
        return {
          type: "mention", // token type (must match name)
          raw: matchAgent[0], // full matched string
          mentionType: "agent",
          attrs: {
            id: matchAgent[2],
            label: matchAgent[1],
          },
        };
      }

      if (matchUser) {
        return {
          type: "mention", // token type (must match name)
          raw: matchUser[0], // full matched string
          mentionType: "user",
          attrs: {
            id: matchUser[2],
            label: matchUser[1],
          },
        };
      }

      return undefined;
    },
  },

  renderMarkdown: (node) => {
    const mentionType = node.attrs?.type ?? "agent";
    const id = node.attrs?.id ?? "";
    const label = node.attrs?.label ?? "";

    if (mentionType === "user") {
      return `:mention_user[${label}]{sId=${id}}`;
    }
    return `:mention[${label}]{sId=${id}}`;
  },

  // Parse Markdown token to Tiptap JSON
  parseMarkdown: (token) => {
    return {
      type: "mention",
      attrs: {
        type: token.mentionType,
        id: token.attrs.id,
        label: token.attrs.label,
      },
    };
  },

  addProseMirrorPlugins(this) {
    const { owner } = this.options;
    const editor = this.editor;
    const markdownManager = editor.markdown!; // we know it exists because we added the markdown plugin

    const parentPlugins = this.parent?.();
    const addedPlugin = new Plugin({
      props: {
        handlePaste: (view, event, slice) => {
          // Get text from the slice after TipTap processing.
          const text = slice.content.textBetween(0, slice.content.size, "\n");

          // Only process if text contains @.
          if (!text.includes("@")) {
            return false;
          }

          const { state } = view;
          const { $from } = state.selection;

          // Check if we're inside a code block
          const isInCodeBlock = $from.parent.type.name === "codeBlock";

          // If we're in a code block, let the default paste behavior handle it
          if (isInCodeBlock) {
            return false;
          }

          // Check if we're inside inline code
          const codeMark = state.schema.marks.code;
          const isInInlineCode = codeMark && !!codeMark.isInSet($from.marks());

          // Prevent default and handle manually.
          event.preventDefault();

          const { from, to } = state.selection;

          // If we're in inline code, just paste as plain text with the code mark
          if (isInInlineCode) {
            const transaction = state.tr.insertText(text, from, to);
            view.dispatch(transaction);
            return true;
          }

          // Create a temporary document node to wrap the fragment and convert to JSON.
          const tempDoc = state.schema.topNodeType.create(null, slice.content);
          // Convert the pasted slice to markdown.
          const markdown = markdownManager.serialize(tempDoc.toJSON());

          // Send to backend to parse mentions.
          parseMentionsOnBackend(markdown, owner.sId)
            .then((processedMarkdown: string) => {
              // Use Tiptap's insertContent with JSON structure.
              // This uses Tiptap's built-in content parsing and validation.
              editor
                .chain()
                .focus()
                .deleteRange({ from, to })
                .insertContentAt(from, processedMarkdown, {
                  contentType: "markdown",
                })
                .run();
            })
            .catch((error: unknown) => {
              logger.error("Failed to parse mentions:", error);
              // Fallback to the default paste behavior.
              const transaction = state.tr.replaceRange(from, to, slice);
              view.dispatch(transaction);
            });

          return true;
        },
      },
    });

    return parentPlugins ? [...parentPlugins, addedPlugin] : [addedPlugin];
  },

  // Override Backspace behavior so it removes a single character from the
  // mention label and converts the chip back to typed text (which re-triggers
  // the @-suggestion dropdown).
  addKeyboardShortcuts() {
    // Shared command to jump to end of line
    const jumpToEndOfLine = () =>
      this.editor.commands.command(({ state, dispatch }) => {
        const { selection } = state;
        const { $from } = selection;

        // Find the end position of the current line
        const endPos = $from.end();

        if (dispatch) {
          const tr = state.tr.setSelection(
            TextSelection.create(state.doc, endPos)
          );
          dispatch(tr);
        }

        return true;
      });

    return {
      ...this.parent?.(),
      Backspace: () =>
        this.editor.commands.command(({ tr, state, dispatch }) => {
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) {
            return false;
          }

          let handled = false;

          // Look for a mention node immediately before the caret.
          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              handled = true;
              const trigger = this.options.suggestion?.char ?? "@";
              const label: string = node.attrs?.label ?? node.attrs?.id ?? "";

              // Compose the raw text form and remove one character from the end.
              const raw = `${trigger}${label}`;
              const next = raw.length > 1 ? raw.slice(0, -1) : trigger;

              tr.insertText(next, pos, pos + node.nodeSize);

              // Place the caret at the end of the inserted text (before any trailing space node).
              const selPos = pos + next.length;
              tr.setSelection(TextSelection.create(tr.doc, selPos));

              if (dispatch) {
                dispatch(tr);
              }

              // Stop scanning further.
              return false;
            }
            return undefined;
          });

          return handled;
        }),
      // Handle Cmd+ArrowRight (Mac) / Ctrl+ArrowRight (Windows/Linux) and End key to jump to end of line
      "Mod-ArrowRight": jumpToEndOfLine,
      End: jumpToEndOfLine,
    };
  },
});

const MAX_MARKDOWN_LENGTH = 10_000; // 10 KB

async function parseMentionsOnBackend(
  text: string,
  ownerSId: string
): Promise<string> {
  // Prevent sending very large markdown payloads to the server which may
  // iterate over all workspace members and cause high CPU usage. If the text
  // exceeds the limit, skip backend parsing and return the original text to
  // avoid triggering a server-side denial-of-service.
  if (text.length > MAX_MARKDOWN_LENGTH) {
    logger.warn(
      `Skipping backend mention parsing: markdown length ${text.length} exceeds limit ${MAX_MARKDOWN_LENGTH}`
    );
    return text;
  }

  const response = await clientFetch(
    `/api/w/${ownerSId}/assistant/mentions/parse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ markdown: text }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to parse mentions");
  }

  const data = await response.json();
  return data.markdown;
}
