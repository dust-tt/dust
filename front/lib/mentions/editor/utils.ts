/**
 * TipTap editor integration utilities for mentions.
 *
 * This module provides utilities for working with mentions in the TipTap
 * editor, including insertion, extraction, and text serialization.
 */

import type { Content, Editor } from "@tiptap/react";

import type { RichMention } from "@app/types";

import { extractFromEditorJSON } from "../format";

/**
 * Inserts a mention into the editor at the current cursor position.
 *
 * Automatically adds spacing before the mention if needed, and always adds
 * a space after the mention for better UX.
 */
export function insertMention(editor: Editor, mention: RichMention): void {
  const shouldAddSpace =
    !editor.isEmpty && editor.getText()[editor.getText().length - 1] !== " ";

  editor
    .chain()
    .focus()
    .insertContent(shouldAddSpace ? " " : "")
    .insertContent({
      type: "mention",
      attrs: {
        type: mention.type,
        id: mention.id,
        label: mention.label,
        description: mention.description,
        pictureUrl: mention.pictureUrl,
      },
    })
    .insertContent(" ")
    .run();
}

/**
 * Extracts all mentions from the editor's current content.
 *
 * @returns Array of rich mention objects
 */
export function getMentions(editor: Editor): RichMention[] {
  return extractFromEditorJSON(editor.getJSON()).mentions;
}

/**
 * Gets the text content from the editor with mentions serialized.
 *
 * Mentions are converted to the format: :mention[name]{sId=xxx}
 *
 * @returns Serialized text with mentions
 */
export function getTextWithMentions(editor: Editor): string {
  return extractFromEditorJSON(editor.getJSON()).text;
}

/**
 * Resets the editor content with mentions.
 *
 * Useful for pre-populating the editor with specific mentions,
 * such as when replying to a message or continuing a conversation.
 */
export function resetWithMentions(
  editor: Editor,
  mentions: RichMention[],
  addSpaceAfter = true
): void {
  const content: Content[] = mentions.map((mention) => ({
    type: "mention",
    attrs: {
      type: mention.type,
      id: mention.id,
      label: mention.label,
      description: mention.description,
      pictureUrl: mention.pictureUrl,
    },
  }));

  if (addSpaceAfter) {
    content.push({ type: "text", text: " " });
  }

  editor.commands.setContent(content);
}

/**
 * Editor utilities for mention handling.
 */
export const editorMentionUtils = {
  insertMention,
  getMentions,
  getTextWithMentions,
  resetWithMentions,
};
