import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const mentionUsersSkill = {
  sId: "mention_users",
  name: "Mention Users",
  userFacingDescription:
    "Allow agents to mention and notify workspace users in conversations.",
  agentFacingDescription: `Search for workspace users and mention them in responses to notify them. Use these tools when:
- The user asks you to notify, alert, or mention someone
- You need to include someone in the conversation`,
  instructions: `The "user_mentions" tools allow you to search for users in the workspace and mention them in your responses.

Important notes:
- Always search for users first using search_available_users before mentioning them
- Use get_mention_markdown to get the correct markdown format for mentions
- Only mention users when it's relevant and appropriate
- Do not over-mention users - only when explicitly requested or clearly necessary

When to mention users (useful situations):
- User explicitly asks to notify someone: "let John know about this", "tag Sarah", "notify the team lead"
- Delegating tasks or requesting approval: "this needs Jane's review", "assign this to Mike"
- Bringing expertise into discussion: "we should get the security team's input on this"
- Following up on action items: "as discussed with Alex, here's the update"
- Notifying stakeholders about critical updates or blockers

When NOT to mention users:
- Answering general questions that don't require immediate attention from anyone
- Providing information summaries or status updates that are purely informational
- Discussing someone in passing without needing their input: "John worked on this last week"
- Routine automated reports or scheduled updates
- When the user mentions someone conversationally without intent to notify: "similar to what Sarah did"
`,
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
