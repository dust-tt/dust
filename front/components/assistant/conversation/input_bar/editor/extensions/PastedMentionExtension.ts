import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import logger from "@app/logger/logger";
import type { RichMention } from "@app/types";

export interface PastedMentionExtensionOptions {
  /**
   * Function to validate a mention label against the backend.
   * Should return the full RichMention if valid, null otherwise.
   */
  validateMention: (label: string) => Promise<RichMention | null>;
}

export const PastedMentionExtensionKey = new PluginKey(
  "pastedMentionExtension"
);

/**
 * Process pasted text to convert valid mentions to mention nodes.
 * This function handles async validation by making parallel API calls.
 * Returns an array of nodes to insert inline.
 */
async function processPastedText(
  text: string,
  editor: Editor,
  validateMention: (label: string) => Promise<RichMention | null>
): Promise<any[] | null> {
  const { schema } = editor.state;
  const mentionType = schema.nodes.mention;

  if (!mentionType) {
    return null;
  }

  // Regular expression to match @mentions.
  // Matches @ followed by one or more word characters or hyphens.
  const mentionRegex =
    /@([\dA-zÀ-ÖØ-öø-įĴ-őŔ-žǍ-ǰǴ-ǵǸ-țȞ-ȟȤ-ȳɃɆ-ɏḀ-ẞƀ-ƓƗ-ƚƝ-ơƤ-ƥƫ-ưƲ-ƶẠ-ỿ.-]+)/g;
  const matches = Array.from(text.matchAll(mentionRegex));

  if (matches.length === 0) {
    return null;
  }

  // Extract all unique mention labels and validate them in parallel.
  const uniqueLabels = new Set(matches.map((match) => match[1].trim()));
  const validationPromises = Array.from(uniqueLabels).map(async (label) => {
    const validated = await validateMention(label);
    return { label, validated };
  });

  const validationResults = await Promise.all(validationPromises);
  const validMentionsMap = new Map<string, RichMention>();

  for (const { label, validated } of validationResults) {
    if (validated) {
      validMentionsMap.set(label, validated);
    }
  }

  // Build an array of content nodes.
  const nodes: any[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const matchIndex = match.index ?? 0;
    const fullMatch = match[0]; // Full match including @
    const label = match[1].trim(); // Capture group: the label without @

    // Add text before the mention.
    if (matchIndex > lastIndex) {
      const textBefore = text.substring(lastIndex, matchIndex);
      if (textBefore) {
        nodes.push(schema.text(textBefore));
      }
    }

    // Check if the mention was validated.
    const validMention = validMentionsMap.get(label);

    if (validMention) {
      // Create a mention node.
      const mentionNode = mentionType.create({
        type: validMention.type,
        id: validMention.id,
        label: validMention.label,
        description: validMention.description,
        pictureUrl: validMention.pictureUrl,
      });
      nodes.push(mentionNode);

      // Add a space after the mention.
      nodes.push(schema.text(" "));
    } else {
      // Invalid mention: keep as plain text.
      nodes.push(schema.text(fullMatch));
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add remaining text after the last mention.
  if (lastIndex < text.length) {
    const textAfter = text.substring(lastIndex);
    if (textAfter) {
      nodes.push(schema.text(textAfter));
    }
  }

  // Return the nodes as a fragment instead of wrapping in a paragraph.
  // This prevents adding extra line breaks.
  return nodes.length > 0 ? nodes : null;
}

/**
 * Extension to handle pasting text containing mentions.
 * When text containing @mentions is pasted, this extension:
 * 1. Detects mention patterns in the pasted text
 * 2. Validates each mention against the backend (async)
 * 3. Converts valid mentions to mention nodes
 * 4. Leaves invalid mentions as plain text
 */
export const PastedMentionExtension =
  Extension.create<PastedMentionExtensionOptions>({
    name: "pastedMentionExtension",

    addOptions() {
      return {
        validateMention: async () => null,
      };
    },

    addProseMirrorPlugins() {
      const { validateMention } = this.options;
      const editor = this.editor;

      return [
        new Plugin({
          key: PastedMentionExtensionKey,
          props: {
            handlePaste: (view, event) => {
              const clipboardData = event.clipboardData;
              if (!clipboardData) {
                return false;
              }

              // Get plain text from clipboard.
              const text = clipboardData.getData("text/plain");
              if (!text) {
                return false;
              }

              // Check if the text contains any @ symbols.
              if (!text.includes("@")) {
                return false;
              }

              // Prevent default paste behavior.
              event.preventDefault();

              // Process the pasted text asynchronously.
              processPastedText(text, editor, validateMention)
                .then((processedNodes) => {
                  if (processedNodes && processedNodes.length > 0) {
                    // Insert the processed nodes inline.
                    const { from, to } = view.state.selection;
                    const tr = view.state.tr;

                    // Delete the selection first.
                    if (from !== to) {
                      tr.delete(from, to);
                    }

                    // Insert each node at the current position.
                    let pos = from;
                    for (const node of processedNodes) {
                      tr.insert(pos, node);
                      pos += node.nodeSize;
                    }

                    view.dispatch(tr.scrollIntoView());
                  } else {
                    // If processing failed, insert the original text.
                    const { from, to } = view.state.selection;
                    view.dispatch(
                      view.state.tr.insertText(text, from, to).scrollIntoView()
                    );
                  }
                })
                .catch((error) => {
                  logger.error({ error }, "Error processing pasted mentions");
                  // On error, insert the original text.
                  const { from, to } = view.state.selection;
                  view.dispatch(
                    view.state.tr.insertText(text, from, to).scrollIntoView()
                  );
                });

              return true;
            },
          },
        }),
      ];
    },
  });
