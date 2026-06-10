import { replaceMentionsWithAt } from "@app/lib/mentions/format";
import removeMarkdown from "remove-markdown";

const PROJECT_TASK_DIRECTIVE_REGEX =
  /(?::pod_task|:project_task|:todo)\[([^\]]+)]\{sId=([^}]+?)}/g;
const TOOL_SETUP_REGEX = /:toolSetup\[([^\]]+)]\{sId=([^}]+?)}/g;
const QUICK_REPLY_REGEX = /:quickReply\[([^\]]+)]\{([^}]*)\}/g;
const CONTENT_NODE_MENTION_REGEX =
  /:content_node_mention\[([^\]]+)](?:\{([^}]*)\})?/g;
const PASTED_REGEX = /:pasted_(?:attachment|content)\[([^\]]+)]\{[^}]*\}/g;
const VISUALIZATION_BLOCK_REGEX = /:::visualization\s*\n[\s\S]*?\n:::\s*/g;
const INSTRUCTION_BLOCK_REGEX =
  /:::instruction_block\[([^\]]*)]\s*\n([\s\S]*?)\n:::\s*/g;

function normalizeInlineLabel(label: string): string {
  return label.replaceAll("\n", " ").replaceAll("\r", " ").trim();
}

function replaceProjectTasks(text: string): string {
  return text.replaceAll(PROJECT_TASK_DIRECTIVE_REGEX, (_, label: string) =>
    normalizeInlineLabel(label)
  );
}

function replaceToolSetup(text: string): string {
  return text.replaceAll(TOOL_SETUP_REGEX, (_, label: string) =>
    normalizeInlineLabel(label)
  );
}

function extractQuotedMessageAttr(attrs: string): string | null {
  const m = attrs.match(/message=(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/);
  if (!m) {
    return null;
  }
  const raw = m[1] ?? m[2] ?? "";
  return raw.replaceAll('\\"', '"').replaceAll("\\'", "'");
}

function replaceQuickReplies(text: string): string {
  return text.replaceAll(
    QUICK_REPLY_REGEX,
    (_full, label: string, attrs: string) => {
      const cleanLabel = normalizeInlineLabel(label);
      const message = extractQuotedMessageAttr(attrs);
      const cleanMsg = message ? normalizeInlineLabel(message) : cleanLabel;
      if (cleanMsg === cleanLabel) {
        return cleanLabel;
      }
      return `${cleanLabel} — ${cleanMsg}`;
    }
  );
}

function replaceContentNodeMentions(text: string): string {
  return text.replaceAll(CONTENT_NODE_MENTION_REGEX, (_full, title: string) =>
    normalizeInlineLabel(title)
  );
}

function replacePastedAttachments(text: string): string {
  return text.replaceAll(PASTED_REGEX, (_full, title: string) => {
    return `📎 ${normalizeInlineLabel(title)}`;
  });
}

function replaceAgentSuggestions(text: string): string {
  return text
    .replaceAll(/::agent_suggestion\[\]\{([^}]*)\}/g, () => "Suggestion")
    .replaceAll(/:agent_suggestion\[\]\{([^}]*)\}/g, () => "Suggestion");
}

function replaceVisualizationBlocks(text: string): string {
  return text.replaceAll(VISUALIZATION_BLOCK_REGEX, () => "Visualization\n\n");
}

function replaceInstructionBlocks(text: string): string {
  return text.replaceAll(
    INSTRUCTION_BLOCK_REGEX,
    (_full, _tag: string, inner: string) => inner.trim()
  );
}

function replaceDustDirectives(text: string): string {
  let out = text;
  out = replaceVisualizationBlocks(out);
  out = replaceInstructionBlocks(out);
  out = replaceToolSetup(out);
  out = replaceProjectTasks(out);
  out = replaceQuickReplies(out);
  out = replaceContentNodeMentions(out);
  out = replacePastedAttachments(out);
  out = replaceAgentSuggestions(out);
  out = replaceMentionsWithAt(out);
  return out;
}

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

const HTML_ENTITY_PATTERN = new RegExp(
  Object.keys(HTML_ENTITIES).join("|"),
  "g"
);

export function decodeHtmlEntities(text: string): string {
  return text.replace(
    HTML_ENTITY_PATTERN,
    (match) => HTML_ENTITIES[match] ?? match
  );
}

/**
 * Turns message content (user or agent) into plain text for previews and
 * notifications. Resolves Dust-specific directives, then strips standard
 * markdown. Citations (`:cite[…]`) are left intact.
 */
export function stripMarkdown(text: string): string {
  return decodeHtmlEntities(removeMarkdown(replaceDustDirectives(text)));
}
