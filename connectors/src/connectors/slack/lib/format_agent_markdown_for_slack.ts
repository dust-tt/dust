import { makeAgentDetailsInConversationUrl } from "@connectors/lib/bot/conversation_utils";
import logger from "@connectors/logger/logger";

const AGENT_MENTION_REGEX = /:mention\[([^\]]+)]\{sId=([^}]+?)}/g;
const USER_MENTION_REGEX = /:mention_user\[([^\]]+)]\{sId=([^}]+?)}/g;
const PROJECT_TODO_REGEX = /:todo\[([^\]]+)]\{sId=([^}]+?)}/g;
const TOOL_SETUP_REGEX = /:toolSetup\[([^\]]+)]\{sId=([^}]+?)}/g;
const QUICK_REPLY_REGEX = /:quickReply\[([^\]]+)]\{([^}]*)\}/g;
const CONTENT_NODE_REGEX = /:content_node_mention\[([^\]]+)](?:\{([^}]*)\})?/g;
const PASTED_REGEX = /:pasted_(?:attachment|content)\[([^\]]+)]\{[^}]*\}/g;
const VISUALIZATION_BLOCK_REGEX = /:::visualization\s*\n[\s\S]*?\n:::\s*/g;
const INSTRUCTION_BLOCK_REGEX =
  /:::instruction_block\[([^\]]*)]\s*\n([\s\S]*?)\n:::\s*/g;

/** Text directives we intentionally leave for downstream (e.g. citation footnotes). */
const DIRECTIVE_NAMES_ALLOWED_AFTER_FORMAT = new Set(["cite"]);

function normalizeInlineLabel(label: string): string {
  return label.replaceAll("\n", " ").replaceAll("\r", " ").trim();
}

/** Slack `<url|label>` breaks if the label contains `|`, `<`, or `>`. */
function slackMrkdwnLinkLabel(label: string): string {
  return label.replaceAll("|", "·").replaceAll("<", "‹").replaceAll(">", "›");
}

function replaceMentionsForSlack(
  text: string,
  agentMentionLinkContext?: { workspaceId: string; conversationId: string }
): string {
  const withAgents = text.replaceAll(
    AGENT_MENTION_REGEX,
    (_full, name: string, agentConfigurationId: string) => {
      const display = slackMrkdwnLinkLabel(normalizeInlineLabel(name));
      if (agentMentionLinkContext) {
        const url = makeAgentDetailsInConversationUrl(
          agentMentionLinkContext.workspaceId,
          agentMentionLinkContext.conversationId,
          agentConfigurationId
        );
        return `<${url}|@${display}>`;
      }
      return `@${display}`;
    }
  );
  return withAgents.replaceAll(
    USER_MENTION_REGEX,
    (_, name: string) => `@${slackMrkdwnLinkLabel(normalizeInlineLabel(name))}`
  );
}

function replaceProjectTodosForSlack(text: string): string {
  return text.replaceAll(
    PROJECT_TODO_REGEX,
    (_, label: string) => `*Todo:* ${normalizeInlineLabel(label)}`
  );
}

function replaceToolSetupForSlack(text: string): string {
  return text.replaceAll(
    TOOL_SETUP_REGEX,
    (_, label: string) => `_${normalizeInlineLabel(label)}_`
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

function replaceQuickRepliesForSlack(text: string): string {
  return text.replaceAll(
    QUICK_REPLY_REGEX,
    (_full, label: string, attrs: string) => {
      const cleanLabel = normalizeInlineLabel(label);
      const message = extractQuotedMessageAttr(attrs);
      const cleanMsg = message ? normalizeInlineLabel(message) : cleanLabel;
      if (cleanMsg === cleanLabel) {
        return `_${cleanLabel}_`;
      }
      return `_${cleanLabel}_ — _${cleanMsg}_`;
    }
  );
}

function replaceContentNodeMentionsForSlack(text: string): string {
  return text.replaceAll(
    CONTENT_NODE_REGEX,
    (_full, title: string, attrs: string | undefined) => {
      const cleanTitle = normalizeInlineLabel(title);
      if (!attrs) {
        return cleanTitle;
      }
      const urlMatch = attrs.match(/url=([^}\s]+)/);
      if (urlMatch?.[1]) {
        return `<${urlMatch[1]}|${cleanTitle}>`;
      }
      return cleanTitle;
    }
  );
}

function replacePastedAttachmentsForSlack(text: string): string {
  return text.replaceAll(PASTED_REGEX, (_full, title: string) => {
    return `📎 _${normalizeInlineLabel(title)}_`;
  });
}

function replaceAgentSuggestionsForSlack(text: string): string {
  return text
    .replaceAll(/::agent_suggestion\[\]\{([^}]*)\}/g, () => "_Suggestion_")
    .replaceAll(/:agent_suggestion\[\]\{([^}]*)\}/g, () => "_Suggestion_");
}

function replaceVisualizationBlocksForSlack(text: string): string {
  return text.replaceAll(
    VISUALIZATION_BLOCK_REGEX,
    () => "_Visualization_\n\n"
  );
}

function replaceInstructionBlocksForSlack(text: string): string {
  return text.replaceAll(
    INSTRUCTION_BLOCK_REGEX,
    (_full, _tag: string, inner: string) => inner.trim()
  );
}

function collectUnsupportedDirectiveSignals(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)\[/g)) {
    const name = m[1];
    if (name && !DIRECTIVE_NAMES_ALLOWED_AFTER_FORMAT.has(name)) {
      found.add(name);
    }
  }
  for (const m of text.matchAll(/^:::([a-zA-Z][a-zA-Z0-9_]*)/gm)) {
    const name = m[1];
    if (name) {
      found.add(`:::${name}`);
    }
  }
  return [...found].sort();
}

export type FormatAgentMarkdownForSlackOptions = {
  /**
   * When both fields are set, `:mention[…]{sId=…}` becomes a Slack
   * `<url|@DisplayName>` link to the agent details view in that conversation
   * (same URL as in-app `agentDetails` query).
   */
  agentMentionLinkContext?: {
    workspaceId: string;
    conversationId: string;
  };
  /**
   * When true, log a warning if any Dust-only directive syntax remains after
   * known transforms. Enable only for the **final** agent `message.content` from
   * a successful generation (e.g. `agent_message_success`). Keep false for
   * in-progress buffers (streaming, length fallback), cancelled runs, or any
   * string that may truncate mid-directive — otherwise you get false positives.
   */
  logUnsupportedDirectives?: boolean;
};

/**
 * Turns Dust-specific markdown directives into Slack-friendly text. Citations
 * (`:cite[…]`) are left intact for {@link annotateCitations}.
 */
export function formatAgentMarkdownForSlack(
  text: string,
  options?: FormatAgentMarkdownForSlackOptions
): string {
  let out = text;
  out = replaceVisualizationBlocksForSlack(out);
  out = replaceInstructionBlocksForSlack(out);
  out = replaceToolSetupForSlack(out);
  out = replaceProjectTodosForSlack(out);
  out = replaceQuickRepliesForSlack(out);
  out = replaceContentNodeMentionsForSlack(out);
  out = replacePastedAttachmentsForSlack(out);
  out = replaceAgentSuggestionsForSlack(out);
  out = replaceMentionsForSlack(out, options?.agentMentionLinkContext);

  if (options?.logUnsupportedDirectives) {
    const unsupported = collectUnsupportedDirectiveSignals(out);
    if (unsupported.length > 0) {
      logger.warn(
        {
          unsupportedDirectives: unsupported,
          preview: out.length > 400 ? `${out.slice(0, 400)}…` : out,
        },
        "Slack agent markdown: unsupported Dust directive(s) after formatting"
      );
    }
  }

  return out;
}
