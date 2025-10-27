/**
 * Mention serialization and parsing utilities.
 *
 * This module handles conversion between different mention representations:
 * - String format: :mention[name]{sId=xxx}
 * - TipTap JSON format
 * - Plain text with @ symbols
 */

import type { JSONContent } from "@tiptap/react";

import type { RichMention } from "./types";

/**
 * Regular expression for parsing mention strings.
 * Format: `:mention[name]{sId=xxx}`
 */
const MENTION_REGEX = /:mention\[([^\]]+)\]\{sId=([^}]+)\}/g;

/**
 * Serializes a mention to the standard string format.
 * Format: :mention[name]{sId=xxx}
 */
export function serializeMention(
  mention: RichMention | { name: string; sId: string }
): string {
  if ("name" in mention && "sId" in mention) {
    // Legacy format support
    return `:mention[${mention.name}]{sId=${mention.sId}}`;
  }
  return `:mention[${mention.label}]{sId=${mention.id}}`;
}

/**
 * Parses mention strings from text.
 * Returns an array of matches with name and sId.
 */
export function parseMentions(text: string): Array<{
  name: string;
  sId: string;
  fullMatch: string;
}> {
  const matches = [...text.matchAll(MENTION_REGEX)];
  return matches.map((match) => ({
    name: match[1],
    sId: match[2],
    fullMatch: match[0],
  }));
}

/**
 * Replaces all mention strings with @-style mentions.
 * :mention[Agent Name]{sId=xxx} -> @Agent Name
 */
export function replaceMentionsWithAt(text: string): string {
  return text.replaceAll(MENTION_REGEX, (_, name) => `@${name}`);
}

/**
 * Extracts text and mentions from a TipTap JSON node structure.
 * Recursively processes the node tree and returns concatenated text with
 * serialized mentions, plus an array of rich mention objects.
 */
export function extractFromEditorJSON(node?: JSONContent): {
  text: string;
  mentions: RichMention[];
} {
  let textContent = "";
  let mentions: RichMention[] = [];

  if (!node) {
    return { text: textContent, mentions };
  }

  // Check if the node is of type 'text' and concatenate its text.
  if (node.type === "text") {
    textContent += node.text;
  }

  // If the node is a 'mention', serialize it and add to mentions array.
  if (node.type === "mention") {
    const mentionData: RichMention = {
      id: node.attrs?.id,
      label: node.attrs?.label,
      type: node.attrs?.type,
      pictureUrl: node.attrs?.pictureUrl ?? "",
      description: node.attrs?.description ?? "",
    };

    textContent += serializeMention({
      name: mentionData.label,
      sId: mentionData.id,
    });

    mentions.push(mentionData);
  }

  // If the node is a 'hardBreak' or a 'paragraph', add a newline character.
  if (node.type && ["hardBreak", "paragraph"].includes(node.type)) {
    textContent += "\n";
  }

  // Handle pasted attachments.
  if (node.type === "pastedAttachment") {
    const title = node.attrs?.title ?? "";
    const fileId = node.attrs?.fileId ?? "";
    textContent += `:pasted_attachment[${title}]{fileId=${fileId}}`;
  }

  // If the node has content, recursively extract from each child node.
  if (node.content) {
    node.content.forEach((childNode) => {
      const childResult = extractFromEditorJSON(childNode);
      textContent += childResult.text;
      mentions = mentions.concat(childResult.mentions);
    });
  }

  return { text: textContent, mentions };
}

/**
 * Utilities for working with mention formats.
 */
export const mentionFormat = {
  serialize: serializeMention,
  parse: parseMentions,
  replaceWithAt: replaceMentionsWithAt,
  extractFromEditorJSON,
  regex: MENTION_REGEX,
};
