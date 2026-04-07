import { MentionComponent } from "@app/components/editor/input_bar/MentionComponent";
import { clientFetch } from "@app/lib/egress/client";
import {
  AGENT_MENTION_REGEX,
  AGENT_MENTION_REGEX_BEGINNING,
  USER_MENTION_REGEX_BEGINNING,
} from "@app/lib/mentions/format";
import logger from "@app/logger/logger";
import type { WorkspaceType } from "@app/types/user";
import type { NodeViewProps } from "@tiptap/core";
import type { MentionOptions } from "@tiptap/extension-mention";
import Mention from "@tiptap/extension-mention";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { RefObject } from "react";

const MENTION_TYPE_ATTRIBUTE = "data-mention-type";
const MENTION_DESCRIPTION_ATTRIBUTE = "data-description";
const MENTION_PICTURE_URL_ATTRIBUTE = "data-picture-url";

// Legacy attribute written by older versions of the extension. Kept for backward compat in parseHTML.
const LEGACY_TYPE_ATTRIBUTE = "data-type";

interface MentionExtensionOptions extends MentionOptions {
  owner: WorkspaceType;
  onFirstAgentMentionPasteRef?: RefObject<
    ((agentId: string) => void) | undefined
  >;
  onAgentMentionsStrippedRef?: RefObject<
    ((count: number) => void) | undefined
  >;
}

export const MentionExtension = Mention.extend<MentionExtensionOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      owner: {} as WorkspaceType,
      onFirstAgentMentionPasteRef: undefined,
      onAgentMentionsStrippedRef: undefined,
    } as MentionExtensionOptions;
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      type: {
        default: "agent",
        parseHTML: (element) =>
          element.getAttribute(MENTION_TYPE_ATTRIBUTE) ??
          element.getAttribute(LEGACY_TYPE_ATTRIBUTE),
        renderHTML: (attributes) => {
          if (!attributes.type) {
            return {};
          }
          return {
            [MENTION_TYPE_ATTRIBUTE]: attributes.type,
          };
        },
      },
      description: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute(MENTION_DESCRIPTION_ATTRIBUTE),
        renderHTML: (attributes) => {
          if (!attributes.description) {
            return {};
          }
          return {
            [MENTION_DESCRIPTION_ATTRIBUTE]: attributes.description,
          };
        },
      },
      pictureUrl: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute(MENTION_PICTURE_URL_ATTRIBUTE),
        renderHTML: (attributes) => {
          if (!attributes.pictureUrl) {
            return {};
          }
          return {
            [MENTION_PICTURE_URL_ATTRIBUTE]: attributes.pictureUrl,
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
    const { owner, onFirstAgentMentionPasteRef, onAgentMentionsStrippedRef } =
      this.options;
    const editor = this.editor;
    const markdownManager = editor.markdown!; // we know it exists because we added the markdown plugin

    const parentPlugins = this.parent?.();
    const addedPlugin = new Plugin({
      props: {
        handlePaste: (view, event, slice) => {
          // Get text from the slice after TipTap processing.
          const text = slice.content.textBetween(0, slice.content.size, "\n");

          // In single-agent mode, check if the slice has agent mention nodes
          // (rich HTML paste). If so, route the first to the picker — then fall
          // through to parseMentionsOnBackend which will strip them from the
          // serialized markdown before inserting.
          let richHtmlAgentId: string | null = null;
          if (onFirstAgentMentionPasteRef?.current) {
            slice.content.descendants((node) => {
              if (
                !richHtmlAgentId &&
                node.type.name === "mention" &&
                node.attrs.type === "agent"
              ) {
                richHtmlAgentId = node.attrs.id;
              }
            });
            if (richHtmlAgentId) {
              onFirstAgentMentionPasteRef?.current(richHtmlAgentId);
            }
          }

          // Only process if text contains @ or we have agent mention nodes to strip.
          if (!text.includes("@") && !richHtmlAgentId) {
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
            // Safety check for Safari: ensure editor is not destroyed before dispatch
            if (!editor.isDestroyed) {
              const transaction = state.tr.insertText(text, from, to);
              view.dispatch(transaction);
            }
            return true;
          }

          // Create a temporary document node to wrap the fragment and convert to JSON.
          const tempDoc = state.schema.topNodeType.create(null, slice.content);
          // Convert the pasted slice to markdown.
          const markdown = markdownManager.serialize(tempDoc.toJSON());

          // Send to backend to parse mentions.
          parseMentionsOnBackend(markdown, owner.sId)
            .then((processedMarkdown: string) => {
              let contentToInsert = processedMarkdown;

              // In single-agent mode, strip all agent mentions from the pasted
              // content and route the first one to the picker (unless we already
              // routed it from the rich-HTML slice check above).
              if (onFirstAgentMentionPasteRef?.current) {
                let markdownAgentId: string | null = null;
                let strippedCount = 0;
                contentToInsert = processedMarkdown
                  .replaceAll(
                    AGENT_MENTION_REGEX,
                    (_match, _label, agentId) => {
                      if (!markdownAgentId) {
                        markdownAgentId = agentId;
                      }
                      strippedCount++;
                      return "";
                    }
                  )
                  .trim();
                if (markdownAgentId && !richHtmlAgentId) {
                  onFirstAgentMentionPasteRef?.current(markdownAgentId);
                }
                // If richHtmlAgentId already claimed the first agent, all
                // markdown-stripped mentions are extras; otherwise subtract one.
                const extraStripped = richHtmlAgentId
                  ? strippedCount
                  : strippedCount - 1;
                if (extraStripped > 0) {
                  onAgentMentionsStrippedRef?.current?.(extraStripped);
                }
              }

              const chain = editor.chain().focus().deleteRange({ from, to });
              if (contentToInsert) {
                chain.insertContentAt(from, contentToInsert, {
                  contentType: "markdown",
                });
              }
              chain.run();
            })
            .catch((error: unknown) => {
              logger.error("Failed to parse mentions:", error);
              // Fallback to the default paste behavior.
              // Safety check for Safari: ensure editor is not destroyed before dispatch
              if (!editor.isDestroyed) {
                const transaction = state.tr.replaceRange(from, to, slice);
                view.dispatch(transaction);
              }
            });

          return true;
        },
      },
    });

    return parentPlugins ? [...parentPlugins, addedPlugin] : [addedPlugin];
  },

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
      // Override Backspace behavior so it removes a single character from the
      // mention label and converts the chip back to typed text (which re-triggers
      // the @-suggestion dropdown).
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
      "Cmd-ArrowRight": jumpToEndOfLine,
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
