import { SEARCH_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import { POD_MANAGER_SERVER_NAME } from "@app/lib/api/actions/servers/pod_manager/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  type ConversationWithoutContentType,
  isPodConversation,
} from "@app/types/assistant/conversation";

export const projectsSkill = {
  sId: "projects",
  name: "Pods",
  userFacingDescription:
    "Allow agents to create conversations & messages in Pods, leverage Pods knowledge.",
  agentFacingDescription:
    "Use Pod context instructions and tools for Pod knowledge retrieval and search. Allow agents to create conversations and messages in Pods.",
  instructions: `
A Pod is a shared environment where a team brings together knowledge, conversations, files and tasks around a specific topic or initiative.

The Pod provides:
- Persistent knowledge storage shared across this Pod
- Pod metadata (description, URLs, members, etc.) for organizational context
- Collaborative context that persists beyond individual conversations

Note: Pods were previously called "Projects". Some users may still refer to them as "Projects"; treat both terms as referring to the same feature.

## Persistent Knowledge

Can be also referred to as the "Pod Context". Pod files live under \`pod/<rel>\`
scoped paths and persist across every conversation in the Pod. Conversation-only files live
under \`conversation/<rel>\` and are visible to this conversation only. Both surfaces are reached
through the same file system; prefer the sandbox when it's available (see the sandbox skill for
the mount layout), and fall back to the \`${FILES_SERVER_NAME}\` MCP tools when it isn't. The Pod also accepts
references to connected data nodes (Company Data); those are managed through the
\`${POD_MANAGER_SERVER_NAME}\` server.

To keep something for later Pod-wide use, write it under a \`pod/<rel>\` path. To duplicate
binary content (PDFs, images, audio) between scopes, use the dedicated copy tool rather than
reading and rewriting, because the round-trip through the agent loses the bytes.

## Referencing tasks in messages

To show a **task** as an interactive chip in the conversation, use this markdown directive with the task's \`sId\`:

\`:pod_task[Short readable label]{sId=<podTaskSId>}\`

Use the \`sId\` from \`pod_tasks\` tools (e.g. \`list_tasks\`, \`create_tasks\`) or from the kickoff message when you are working on a task. The bracket text is display-only; keep it concise.

## Tool Usage Priority

When you need to find information, use this order (skip steps if the relevant tools are not in your tool list):
1. **Pod overview**: \`${POD_MANAGER_SERVER_NAME}\` \`get_information\` returns the Pod URL, description, and what is attached to the Pod.
2. **Pod files**: read and search \`pod/<rel>\` files through the sandbox or the \`${FILES_SERVER_NAME}\` MCP tools.
3. **Company-wide**: If still insufficient, use \`company_data_*\` tools and \`${SEARCH_SERVER_NAME}\` for broader company data sources.
`,

  mcpServers: [{ name: "pod_manager" }, { name: "pod_tasks" }],
  version: 3,
  icon: "ActionFolderIcon",
  isRestricted: undefined,
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
  if (conversation && isPodConversation(conversation)) {
    const space = await SpaceResource.fetchById(auth, conversation.spaceId);
    instructions += `
IMPORTANT: This conversation (id: ${conversation.sId}) is part of the Pod "${space?.name}" (id: ${space?.sId}).
Therefore, ALWAYS start by using the Pod tools to search for information before using company-wide tools.
`;
  }

  return instructions;
}
