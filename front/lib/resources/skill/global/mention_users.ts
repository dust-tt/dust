import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/mention_users/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import type { UserMessageType } from "@app/types";

export const mentionUsersSkill = {
  sId: "mention_users",
  name: "Mention Users",
  userFacingDescription:
    "Notify and address specific users in conversations by mentioning them. Users receive notifications when mentioned.",
  agentFacingDescription:
    "In multi-user conversations, mention specific users to send them notifications and direct your response to them. Use when: addressing someone directly, delegating tasks, requesting input from specific people, or responding to questions where a particular person should be notified. Mentions ensure the right people are alerted and know the message is for them.",
  fetchInstructions: async (
    _auth: Authenticator,
    { userMessage }: { userMessage?: UserMessageType }
  ) => {
    const isSlackOrTeams =
      userMessage?.context.origin === "slack" ||
      userMessage?.context.origin === "teams";

    if (isSlackOrTeams) {
      return "";
    }

    return (
      `\n## MENTIONING USERS\n` +
      'You can notify users in this conversation by mentioning them (also called "pinging").\n' +
      "\n" +
      "User mentions require a specific markdown format. " +
      "You MUST use the tools below - attempting to guess or construct the format manually will fail silently and the user will NOT be notified.\n" +
      "\n### Required 2-step process:\n" +
      `1. Call \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` with a search term (or empty string "" to list all users)\n` +
      `   - Returns JSON array: [{"id": "user_123", "label": "John Doe", "type": "user", ...}]\n` +
      `   - Extract the "id" and "label" fields from the user you want to mention\n` +
      `2. Call \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` with the exact id and label from step 1\n` +
      `   - Pass: { mention: { id: "user_123", label: "John Doe" } }\n` +
      `   - Returns the correct mention string to include in your response\n` +
      "\n### Format distinction (for reference only - never construct manually):\n" +
      "- Agent mentions: `:mention[Name]{sId=agent_id}` (no suffix)\n" +
      "- User mentions: `:mention_user[Name]{sId=user_id}` (note the `_user` suffix)\n" +
      "- The `_user` suffix is critical - wrong format = no notification sent\n" +
      "\n### Common mistakes to avoid:\n" +
      "WRONG: `:mention[John Doe]{sId=user_123}` (missing _user suffix)\n" +
      "WRONG: `@John Doe` (only works in Slack/Teams, not web)\n" +
      "WRONG: Constructing the format yourself without tools\n" +
      `CORRECT: Always use ${SEARCH_AVAILABLE_USERS_TOOL_NAME} + ${GET_MENTION_MARKDOWN_TOOL_NAME}\n` +
      "\n### When to mention users:\n" +
      "- In multi-user conversations, prefix your response with a mention to address specific users directly\n" +
      "- Only use mentions when you want to ping/notify the user (they receive a notification)\n" +
      "- To simply refer to someone without notifying them, use their name as plain text"
    );
  },
  mcpServers: [{ name: "mention_users" }],
  version: 1,
  icon: "UserIcon",
  isAutoEnabled: true,
} as const satisfies GlobalSkillDefinition;
