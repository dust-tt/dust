/**
 * Mention serialization and parsing utilities.
 *
 * This module handles conversion between different mention representations:
 * - String format: `:mention[name]{sId=xxx}`
 * - TipTap JSON format
 * - Plain text with @ symbols
 */

import type { JSONContent } from "@tiptap/react";

import type { RichMention } from "@app/types";
import { assertNever } from "@app/types";

/**
 * Regular expression for parsing agent mention strings.
 * Format: `:mention[name]{sId=xxx}`
 */
export const AGENT_MENTION_REGEX = /:mention\[([^\]]+)]\{sId=([^}]+?)}/g;
export const AGENT_MENTION_REGEX_BEGINNING = new RegExp(
  "^" + AGENT_MENTION_REGEX.source,
  AGENT_MENTION_REGEX.flags
);

/**
 * Regular expression for parsing mention strings.
 * Format: `:mention_user[name]{sId=xxx}`
 */
export const USER_MENTION_REGEX = /:mention_user\[([^\]]+)]\{sId=([^}]+?)}/g;
export const USER_MENTION_REGEX_BEGINNING = new RegExp(
  "^" + USER_MENTION_REGEX.source,
  USER_MENTION_REGEX.flags
);
/**
 * Serializes a mention to the standard string format.
 * Format:
 *  * agent: `:mention[name]{sId=xxx}`
 *  * user: `:mention_user[name]{sId=xxx}`
 */
export function serializeMention(
  mention:
    | { name: string; sId: string }
    | { id: string; type: "agent" | "user"; label: string }
): string {
  if ("name" in mention && "sId" in mention) {
    // Legacy format support
    return `:mention[${mention.name}]{sId=${mention.sId}}`;
  }
  switch (mention.type) {
    case "agent":
      return `:mention[${mention.label}]{sId=${mention.id}}`;
    case "user":
      return `:mention_user[${mention.label}]{sId=${mention.id}}`;
    default:
      assertNever(mention.type);
  }
}

/**
 * Replaces all mention strings with @-style mentions.
 * `:mention[Agent Name]{sId=xxx}` -> @Agent Name
 * `:mention_user[User Name]{sId=xxx}` -> @User Name
 */
export function replaceMentionsWithAt(text: string): string {
  return text
    .replaceAll(AGENT_MENTION_REGEX, (_, name) => `@${name}`)
    .replaceAll(USER_MENTION_REGEX, (_, name) => `@${name}`);
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

  // If the node is a 'mention', concatenate the mention label and add to mentions array.
  if (node.type === "mention") {
    mentions.push({
      id: node.attrs?.id,
      label: node.attrs?.label,
      type: node.attrs?.type,
      pictureUrl: node.attrs?.pictureUrl,
      description: node.attrs?.description,
    });

    textContent += serializeMention({
      name: node.attrs?.label,
      sId: node.attrs?.id,
    });
  }

  // If the node is a 'hardBreak' or a 'paragraph', add a newline character.
  if (node.type && ["hardBreak", "paragraph"].includes(node.type)) {
    textContent += "\n";
  }

  if (node.type === "pastedAttachment") {
    const title = node.attrs?.title ?? "";
    const fileId = node.attrs?.fileId ?? "";
    textContent += `:pasted_content[${title}]{pastedId=${fileId}}`;
  }

  // If the node has content, recursively get text and mentions from each child node
  if (node.content) {
    node.content.forEach((childNode) => {
      const childResult = extractFromEditorJSON(childNode);
      textContent += childResult.text;
      mentions = mentions.concat(childResult.mentions);
    });
  }

  return { text: textContent, mentions };
}
