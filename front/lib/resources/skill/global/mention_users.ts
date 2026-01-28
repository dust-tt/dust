import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
} from "@app/lib/actions/constants";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

const MENTION_USERS_INSTRUCTIONS =
  "You have the ability to mention users in your messages using markdown directives.\n\n" +
  "Mentioning users:\n" +
  `- Use \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` to search for users by name. Provide a search term to find matching users, or use an empty string to list all available users.\n` +
  `- Once you have identified the user you want to mention, use \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` to get the correct markdown directive for that user.\n` +
  "- Insert the markdown directive in your message where you want the mention to appear.\n\n" +
  "Best practices:\n" +
  "- In conversations with multiple users, consider prefixing your response with a mention of the user you're addressing.\n" +
  "- Mentions ensure the right person is notified and help maintain clarity in group conversations.\n" +
  "- Use mentions when you need to direct a question or response to a specific person.";

export const mentionUsersSkill = {
  sId: "mention_users",
  name: "Mention Users",
  userFacingDescription:
    "Enable agents to mention users in conversations, ensuring the right people are notified and addressed.",
  agentFacingDescription:
    "Search for users and mention them in messages using markdown directives.",
  instructions: MENTION_USERS_INSTRUCTIONS,
  mcpServers: [{ name: "common_utilities" }],
  version: 1,
  icon: "UserIcon",
  isAutoEnabled: true,
} as const satisfies GlobalSkillDefinition;
