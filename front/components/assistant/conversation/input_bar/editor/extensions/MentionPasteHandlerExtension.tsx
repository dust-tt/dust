import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import type { WorkspaceType } from "@app/types";
import type { RichMention } from "@app/types";

interface MentionPasteHandlerOptions {
  owner: WorkspaceType;
}

export const MentionPasteHandlerKey = new PluginKey("mentionPasteHandler");

export const MentionPasteHandlerExtension =
  Extension.create<MentionPasteHandlerOptions>({
    name: "MentionPasteHandler",

    addProseMirrorPlugins() {
      const owner = this.options.owner;

      return [
        new Plugin({
          key: MentionPasteHandlerKey,
          props: {
            handlePaste: (view, event) => {
              const text = event.clipboardData?.getData("text/plain");
              if (!text || !owner) {
                return false;
              }

              // Check if there are any potential @mentions in the pasted text.
              const mentionRegex = /(^@|\s@)([a-zA-Z0-9_-]+)/g;
              const matches = [...text.matchAll(mentionRegex)];

              if (matches.length === 0) {
                return false;
              }

              // Extract unique mention names (without the @).
              const names = [...new Set(matches.map((match) => match[2]))];

              // Prevent default paste behavior - we'll handle it asynchronously.
              event.preventDefault();

              // Call backend to match these names.
              fetch(`/api/w/${owner.sId}/assistant/mentions/match`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ names }),
              })
                .then((response) => {
                  if (!response.ok) {
                    throw new Error(
                      `Failed to match mentions: ${response.statusText}`
                    );
                  }
                  return response.json();
                })
                .then((data: { matches: RichMention[] }) => {
                  const matchedMentions = data.matches || [];

                  // Build a map of matched mentions by label (case-insensitive).
                  const mentionMap = new Map<string, RichMention>();
                  matchedMentions.forEach((m) => {
                    mentionMap.set(m.label.toLowerCase(), m);
                  });

                  // Process the pasted text and build content nodes.
                  const content: any[] = [];
                  let lastIndex = 0;

                  // Create a regex to match all @mentions.
                  const allMentionsRegex = /(^@|\s@)([a-zA-Z0-9_-]+)/g;
                  const allMatches = [...text.matchAll(allMentionsRegex)];

                  allMatches.forEach((match) => {
                    const fullMatch = match[0]; // e.g., "@dust" or " @dust"
                    const prefix = match[1]; // e.g., "@" or " @"
                    const name = match[2]; // e.g., "dust"
                    const matchStart = match.index ?? 0;
                    const matchEnd = matchStart + fullMatch.length;

                    const mention = mentionMap.get(name.toLowerCase());

                    // Add text before the match.
                    if (lastIndex < matchStart) {
                      const beforeText = text.substring(lastIndex, matchStart);
                      content.push({ type: "text", text: beforeText });
                    }

                    if (mention) {
                      // Add whitespace prefix if there was one.
                      if (prefix.trim() !== "@") {
                        content.push({ type: "text", text: " " });
                      }

                      // Add the mention node.
                      content.push({
                        type: "mention",
                        attrs: {
                          type: mention.type,
                          id: mention.id,
                          label: mention.label,
                          description: mention.description,
                          pictureUrl: mention.pictureUrl,
                        },
                      });

                      // Add a space after the mention.
                      content.push({ type: "text", text: " " });
                    } else {
                      // Not matched - keep as plain text.
                      content.push({ type: "text", text: fullMatch });
                    }

                    lastIndex = matchEnd;
                  });

                  // Add remaining text after the last match.
                  if (lastIndex < text.length) {
                    content.push({
                      type: "text",
                      text: text.substring(lastIndex),
                    });
                  }

                  // Insert the content at the current cursor position.
                  const { state } = view;
                  const { selection } = state;

                  // Create a paragraph node with the content.
                  const nodes = content
                    .map((item) => {
                      if (item.type === "text") {
                        return state.schema.text(item.text);
                      } else if (item.type === "mention") {
                        return state.schema.nodes.mention.create(item.attrs);
                      }
                      return null;
                    })
                    .filter(
                      (node): node is NonNullable<typeof node> => node !== null
                    );

                  const transaction = state.tr.replaceWith(
                    selection.from,
                    selection.to,
                    nodes
                  );

                  view.dispatch(transaction);
                })
                .catch((error) => {
                  console.error("Error matching mentions:", error);
                  // On error, insert plain text.
                  const { state } = view;
                  const { selection } = state;
                  const transaction = state.tr.insertText(
                    text,
                    selection.from,
                    selection.to
                  );
                  view.dispatch(transaction);
                });

              // Return true to indicate we've handled the paste.
              return true;
            },
          },
        }),
      ];
    },
  });
