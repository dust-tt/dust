/**
 * Mention serialization and parsing utilities.
 *
 * This module handles conversion between different mention representations:
 * - String format: `:mention[name]{sId=xxx}`
 * - TipTap JSON format
 * - Plain text with @ symbols
 */

import {
  getFirstKnowledgeItem,
  isFullKnowledgeItem,
  serializeKnowledgeTag,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeTypes";
import type { SkillReference } from "@app/lib/skills/format";
import { serializeSkillTag } from "@app/lib/skills/format";
import type { ToolReference } from "@app/lib/tools/format";
import { serializeToolTag } from "@app/lib/tools/format";
import type {
  AgentMention,
  MentionType,
  RichMention,
  UserMention,
} from "@app/types/assistant/mentions";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { JSONContent } from "@tiptap/react";

/**
 * Regular expression for parsing agent mention strings.
 * Format: `:mention[name]{sId=xxx}`
 */
export const AGENT_MENTION_REGEX = /:mention\[([^\]]+)]\{sId=([^}]+?)}/g;
export const AGENT_MENTION_REGEX_BEGINNING = new RegExp(
  "^" + AGENT_MENTION_REGEX.source,
  AGENT_MENTION_REGEX.flags.replace("g", "")
);

/**
 * Regular expression for parsing mention strings.
 * Format: `:mention_user[name]{sId=xxx}`
 */
export const USER_MENTION_REGEX = /:mention_user\[([^\]]+)]\{sId=([^}]+?)}/g;
export const USER_MENTION_REGEX_BEGINNING = new RegExp(
  "^" + USER_MENTION_REGEX.source,
  USER_MENTION_REGEX.flags.replace("g", "")
);

export function startsWithUserMention(markdown: string): boolean {
  return USER_MENTION_REGEX_BEGINNING.test(markdown.trimStart());
}

/**
 * Extracts mentions from content.
 * @param content the content to extract mentions from
 * @returns an array of mentions
 */
export function extractFromString(content: string): MentionType[] {
  // Extract agent mentions
  const agentMentions: AgentMention[] = [
    ...content.matchAll(AGENT_MENTION_REGEX),
  ].map((match) => ({ configurationId: match[2] }));
  // Extract user mentions
  const userMentions: UserMention[] = [
    ...content.matchAll(USER_MENTION_REGEX),
  ].map((match) => ({ type: "user", userId: match[2] }));

  // Return the mentions
  return [...agentMentions, ...userMentions];
}

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
function normalizeMentionLabel(label: string): string {
  return label.replaceAll("\n", " ").replaceAll("\r", " ").trim();
}

export function replaceMentionsWithAt(text: string): string {
  return text
    .replaceAll(
      AGENT_MENTION_REGEX,
      (_, name) => `@${normalizeMentionLabel(name)}`
    )
    .replaceAll(
      USER_MENTION_REGEX,
      (_, name) => `@${normalizeMentionLabel(name)}`
    );
}

const CONTENT_NODE_MENTION_URL_REGEX =
  /(:content_node_mention\[[^\]]+])\{url="?[^"}]*"?}/g;

/**
 * Drops the url of `:content_node_mention[title]{url="..."}` for model-facing text.
 * The referenced content is already attached, and an echoed url streams raw in Slack.
 */
export function stripContentNodeMentionUrls(text: string): string {
  return text.replaceAll(CONTENT_NODE_MENTION_URL_REGEX, "$1");
}

/**
 * Extracts text and mentions from a TipTap JSON node structure.
 * Recursively processes the node tree and returns concatenated text with
 * serialized mentions, plus an array of rich mention objects.
 */
export function extractFromEditorJSON(node?: JSONContent): {
  text: string;
  mentions: RichMention[];
  skills: SkillReference[];
  tools: ToolReference[];
  knowledge: DataSourceViewContentNode[];
} {
  let textContent = "";
  let mentions: RichMention[] = [];
  let skills: SkillReference[] = [];
  let tools: ToolReference[] = [];
  let knowledge: DataSourceViewContentNode[] = [];

  if (!node) {
    return { text: textContent, mentions, skills, tools, knowledge };
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

  if (node.type === "skill") {
    const skillId = node.attrs?.skillId;
    const skillIcon = node.attrs?.skillIcon;
    const skillName = node.attrs?.skillName;

    if (isString(skillId) && isString(skillName)) {
      skills.push({
        id: skillId,
        icon: isString(skillIcon) ? skillIcon : null,
        name: skillName,
      });
      textContent += serializeSkillTag({
        id: skillId,
        icon: isString(skillIcon) ? skillIcon : null,
        name: skillName,
      });
    }
  }

  if (node.type === "toolNode") {
    const mcpServerViewId = node.attrs?.mcpServerViewId;
    const toolIcon = node.attrs?.toolIcon;
    const toolName = node.attrs?.toolName;

    if (isString(mcpServerViewId) && isString(toolName)) {
      tools.push({
        id: mcpServerViewId,
        icon: isString(toolIcon) ? toolIcon : null,
        name: toolName,
      });
      textContent += serializeToolTag({
        id: mcpServerViewId,
        icon: isString(toolIcon) ? toolIcon : null,
        name: toolName,
      });
    }
  }

  if (node.type === "knowledgeNode") {
    const item = getFirstKnowledgeItem(node.attrs ?? {});
    if (item) {
      if (isFullKnowledgeItem(item)) {
        knowledge.push(item.node);
      }
      textContent += serializeKnowledgeTag(item);
    }
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
      skills = skills.concat(childResult.skills);
      tools = tools.concat(childResult.tools);
      knowledge = knowledge.concat(childResult.knowledge);
    });
  }

  return { text: textContent, mentions, skills, tools, knowledge };
}
