import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/common_utilities/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import type { UserMessageType } from "@app/types";

export const mentionUsersSkill = {
  sId: "mention_users",
  name: "Mention Users",
  userFacingDescription:
    "Notify and address specific users in conversations by mentioning them. Users receive notifications when mentioned.",
  agentFacingDescription:
    "Mention users in conversations to notify and address them directly.",
  fetchInstructions: async (
    _auth: Authenticator,
    { userMessage }: { spaceIds: string[]; userMessage: UserMessageType }
  ) => {
    const isSlackOrTeams =
      userMessage.context.origin === "slack" ||
      userMessage.context.origin === "teams";

    if (!isSlackOrTeams) {
      return (
        `## MENTIONING USERS\n` +
        'You can notify users in this conversation by mentioning them (also called "pinging").\n' +
        "\n### CRITICAL: You MUST use the tools - DO NOT guess the format\n" +
        "User mentions require a specific markdown format that is DIFFERENT from agent mentions.\n" +
        "Attempting to guess or construct the format manually WILL FAIL and the user will NOT be notified.\n" +
        "\n### How to mention a user (required 2-step process):\n" +
        `1. Call \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` with a search term (or empty string "" to list all users)\n` +
        `   - Returns JSON array with user info: [{"id": "user_123", "label": "John Doe", "type": "user", ...}]\n` +
        `   - Extract the "id" and "label" fields from the user you want to mention\n` +
        `2. Call \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` with the exact id and label from step 1\n` +
        `   - Pass: { mention: { id: "user_123", label: "John Doe" } }\n` +
        `   - Returns the correct mention string to include directly in your response\n` +
        "\n### Format distinction (for reference only - NEVER construct manually):\n" +
        "- Agent mentions: `:mention[Name]{sId=agent_id}` (no suffix)\n" +
        "- User mentions: `:mention_user[Name]{sId=user_id}` (note the `_user` suffix)\n" +
        "- The `_user` suffix is critical - wrong format = no notification sent\n" +
        "\n### Common mistakes to AVOID:\n" +
        "❌ WRONG: `:mention[John Doe]{sId=user_123}` (missing _user suffix)\n" +
        "❌ WRONG: `@John Doe` (only works in Slack/Teams, not web)\n" +
        "❌ WRONG: Trying to construct the format yourself without tools\n" +
        `✓ CORRECT: Always use ${SEARCH_AVAILABLE_USERS_TOOL_NAME} + ${GET_MENTION_MARKDOWN_TOOL_NAME}\n` +
        "\n### When to mention users:\n" +
        "- In multi-user conversations, prefix your response with a mention to address specific users directly\n" +
        "- Only use mentions when you want to ping/notify the user (they receive a notification)\n" +
        "- To simply refer to someone without notifying them, use their name as plain text"
      );
    } else {
      return (
        `## MENTIONING USERS\n` +
        "You have the ability to mention users in a message using the markdown directive." +
        '\nUsers can also refer to mention as "ping".' +
        `\nDo not use the \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` or the \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` tools to mention users.\n` +
        "\nUse a simple @username to mention users in your messages in this conversation."
      );
    }
  },
  mcpServers: [{ name: "common_utilities" }],
  version: 1,
  icon: "UserIcon",
  isAutoEnabled: true,
} as const satisfies GlobalSkillDefinition;
