import { getUserInfo } from "@connectors/connectors/slack/lib/bot_user_helpers";
import { getChannelNameById } from "@connectors/connectors/slack/lib/channels";
import type { ModelId } from "@connectors/types";
import type { WebClient } from "@slack/web-api";

// `<@U123>` and `<#C123>`: Slack sends mentions as bare ids (no label) in both rich_text and
// mrkdwn, and the formatter leaves these tokens intact for us to resolve here.
const USER_MENTION_RE = /<@[UW][A-Z0-9]+>/g;
const CHANNEL_MENTION_RE = /<#[A-Z0-9]+>/g;

// Resolves a single mention token to its display form via the Slack API: `<@U123>` -> `@name`,
// `<#C123>` -> `#name`, falling back to the raw id when it does not resolve.
async function resolveMentionToken(
  token: string,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string> {
  const id = token.replace(/[<@#>]/g, "");
  if (token.startsWith("<@")) {
    const { name } = await getUserInfo(id, connectorId, slackClient);
    return `@${name ?? id}`;
  }
  const name = await getChannelNameById(connectorId, slackClient, id);
  return `#${name ?? id}`;
}

// Resolves every user/channel mention token the formatter left in the rendered body.
export async function processMessageForMentions(
  body: string,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string> {
  const tokens = new Set([
    ...(body.match(USER_MENTION_RE) ?? []),
    ...(body.match(CHANNEL_MENTION_RE) ?? []),
  ]);

  let resolved = body;
  for (const token of tokens) {
    resolved = resolved.replaceAll(
      token,
      await resolveMentionToken(token, connectorId, slackClient)
    );
  }
  return resolved;
}
