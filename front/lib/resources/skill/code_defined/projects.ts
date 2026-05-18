import { SEARCH_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import { PROJECT_MANAGER_SERVER_NAME } from "@app/lib/api/actions/servers/project_manager/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  type ConversationWithoutContentType,
  isProjectConversation,
} from "@app/types/assistant/conversation";

export const projectsSkill = {
  sId: "projects",
  name: "Projects",
  userFacingDescription:
    "Allow agents to create conversations & messages in projects, leverage projects knowledge.",
  agentFacingDescription:
    "Use project context instructions and tools for project knowledge retrieval and search. Allow agents to create conversations and messages in projects.",
  instructions: `
The project provides:
- Persistent knowledge storage shared across this project
- Project metadata (description, URLs, members, etc.) for organizational context
- Collaborative context that persists beyond individual conversations

## Persistent Knowledge

Can be also referred to as the "Project Context". Project files live under \`project/<rel>\`
scoped paths and persist across every conversation in the project. Conversation-only files live
under \`conversation/<rel>\` and are visible to this conversation only. Both surfaces are reached
through the same file system; prefer the sandbox when it's available (see the sandbox skill for
the mount layout), and fall back to the \`${FILES_SERVER_NAME}\` MCP tools when it isn't. The project also accepts
references to connected data nodes (Company Data); those are managed through the
\`${PROJECT_MANAGER_SERVER_NAME}\` server.

To keep something for later project-wide use, write it under a \`project/<rel>\` path. To duplicate
binary content (PDFs, images, audio) between scopes, use the dedicated copy tool rather than
reading and rewriting, because the round-trip through the agent loses the bytes.

## Referencing project tasks in messages

To show a **project task** as an interactive chip in the conversation, use this markdown directive with the task's \`sId\`:

\`:project_task[Short readable label]{sId=<projectTaskSId>}\`

Use the \`sId\` from \`project_tasks\` tools (e.g. \`list_tasks\`, \`create_tasks\`) or from the kickoff message when you are working on a task. The bracket text is display-only; keep it concise.

## Tool Usage Priority

When you need to find information, use this order (skip steps if the relevant tools are not in your tool list):
1. **Project overview**: \`${PROJECT_MANAGER_SERVER_NAME}\` \`get_information\` returns the project URL, description, and what is attached to the project.
2. **Project files**: read and search \`project/<rel>\` files through the sandbox or the \`${FILES_SERVER_NAME}\` MCP tools.
3. **Company-wide**: If still insufficient, use \`company_data_*\` tools and \`${SEARCH_SERVER_NAME}\` for broader company data sources.
`,

  mcpServers: [{ name: "project_manager" }, { name: "project_tasks" }],
  version: 3,
  icon: "ActionFolderIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !flags.includes("projects");
  },
  // Note: we auto enabled in listForAgentLoop for project conversations.
} as const satisfies GlobalSkillDefinition;

export async function constructProjectContext(
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation?: ConversationWithoutContentType;
  }
): Promise<string> {
  let instructions = "";

  // Add important note for project conversations to strongly emphasize the importance of using project tools first.
  if (conversation && isProjectConversation(conversation)) {
    const space = await SpaceResource.fetchById(auth, conversation.spaceId);
    instructions += `
IMPORTANT: This conversation (id: ${conversation.sId}) is part of the project "${space?.name}" (id: ${space?.sId}).
Therefore, ALWAYS start by using the project tools to search for information before using company-wide tools.
`;
  }

  return instructions;
}
