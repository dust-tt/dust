import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const mentionUsersSkill = {
  sId: "mention_users",
  name: "Mention Users",
  userFacingDescription:
    "Allow agents to mention and notify workspace users in conversations.",
  agentFacingDescription:
    "Search for workspace users and mention them in responses to notify them.",
  instructions: `The "user_mentions" tools allow you to search for users in the workspace and mention them in your responses.

Use these tools when:
- The user asks you to notify or mention someone
- You need to include someone in the conversation
- You want to alert a specific person about something

Important notes:
- Always search for users first using search_available_users before mentioning them
- Use get_mention_markdown to get the correct markdown format for mentions
- Only mention users when it's relevant and appropriate
- Do not over-mention users - only when explicitly requested or clearly necessary`,
  mcpServers: [{ name: "user_mentions" }],
  version: 1,
  icon: "ActionMegaphoneIcon",
  isAutoEnabled: true,
  isDisabledForAgentLoop: ({ userMessage }) => {
    return (
      userMessage.context.origin === "slack" ||
      userMessage.context.origin === "slack_workflow" ||
      userMessage.context.origin === "teams"
    );
  },
} as const satisfies GlobalSkillDefinition;
