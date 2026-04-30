import { SEARCH_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_SEARCH_FILES_ACTION_NAME,
} from "@app/lib/api/actions/servers/conversation_files/metadata";
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
- Persistent knowledge storage shared accross this project
- Project metadata (description, URLs, members, etc.) for organizational context
- Semantic search over project knowledge and project conversation transcripts
- Collaborative context that persists beyond individual conversations

## Persistent Knowledge

Can be also referred to as the "Project Context".
It contains attachments (files, linked connected data nodes) as well as conversations transcripts.
It is stored in the project data source and can be searched using the \`semantic_search\` tool.

### Project attachments vs conversation attachments
- **Project attachments**: Persist for every conversation in the project; managed with \`${PROJECT_MANAGER_SERVER_NAME}\` (e.g. \`add_file\`).
- **Conversation attachments**: Only for this conversation; use \`${CONVERSATION_FILES_SERVER_NAME}\` tools when present.

To keep something for later project-wide use, add it with \`add_file\`.
To reuse an existing project file in this conversation, use \`attach_to_conversation\`.

## Referencing project TODOs in messages

To show a **project TODO** as an interactive chip in the conversation, use this markdown directive with the todo's \`sId\`:

\`:todo[Short readable label]{sId=<projectTodoSId>}\`

Use the \`sId\` from \`project_todos\` tools (e.g. \`list_todos\`, \`create_todos\`) or from the kickoff message when you are working on a todo. The bracket text is display-only; keep it concise.

## Tool Usage Priority

When you need to find information, uses this order (skip steps if the relevant tools are not in your tool list):
1. **Project overview**: \`${PROJECT_MANAGER_SERVER_NAME}\` \`get_information\` — project URL, description, and what is attached to the project.
2. **This conversation's attachments** (only when \`${CONVERSATION_FILES_SERVER_NAME}\` is available): \`${CONVERSATION_SEARCH_FILES_ACTION_NAME}\` on \`${CONVERSATION_FILES_SERVER_NAME}\` — search files attached to the current conversation.
3. **Project-wide search**: \`${PROJECT_MANAGER_SERVER_NAME}\` \`semantic_search\` — search project knowledge and/or conversations in the project; usually the best source for project-specific questions.
4. **Company-wide**: If still insufficient, use \`company_data_*\` tools and \`${SEARCH_SERVER_NAME}\` for broader company data sources.
`,

  mcpServers: [{ name: "project_manager" }, { name: "project_todos" }],
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
