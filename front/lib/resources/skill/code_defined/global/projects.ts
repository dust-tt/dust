import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import {
  POD_MANAGER_SERVER_NAME,
  SEMANTIC_SEARCH_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_manager/metadata";
import {
  formatPodAgentsMdPromptSection,
  readPodAgentsMdContent,
} from "@app/lib/api/projects/agents_md";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  type ConversationWithoutContentType,
  isPodConversation,
} from "@app/types/assistant/conversation";

export const projectsSkill = {
  sId: "projects",
  kind: "global",
  name: "Pods",
  userFacingDescription: "Use Pod knowledge, files, conversations, and tasks.",
  agentFacingDescription:
    "Use Pod-scoped knowledge and tools when the user asks for Pod work.",
  instructions: `
A Pod (previously called a Project) is shared context for files, connected data,
conversations, and tasks. Use Pod tools only for Pod-scoped work.

- For a topic, use \`${getPrefixedToolName(POD_MANAGER_SERVER_NAME, SEMANTIC_SEARCH_TOOL_NAME)}\`.
- For metadata, use \`${POD_MANAGER_SERVER_NAME}\` \`get_information\`.
- For a known file, use the sandbox or \`${FILES_SERVER_NAME}\` under \`pod-{podId}/<rel>\`.
- Use company-wide search only when Pod sources are insufficient.

Create a Pod conversation only when the user asks for a separate conversation.
Post to an existing Pod conversation only when the user explicitly asks to send a
message there. Never use Pod conversation tools for an ordinary reply in the active
conversation. For an explicit handoff to a named agent there, pass both the active
conversation ID and agentName.

Reference a task with \`:pod_task[Label]{sId=<taskId>}\`.
`,

  mcpServers: [{ name: "pod_manager" }, { name: "pod_tasks" }],
  version: 5,
  icon: "ActionFolderIcon",
  isRestricted: undefined,
  getAutoEnabledOrEquippedForAgentLoop: ({ conversation }) =>
    isPodConversation(conversation) ? "enabled" : undefined,
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

  if (conversation && isPodConversation(conversation)) {
    const space = await SpaceResource.fetchById(auth, conversation.spaceId);
    // The conversation id is intentionally omitted: the model already receives it in every user
    // message metadata header, and keeping this block per-pod stable lets conversations in the
    // same Pod share their prompt prefix for caching.
    instructions += `
This conversation is part of the Pod "${space?.name}" (id: ${space?.sId}).
Use its context when relevant before searching company-wide sources.
`;

    const agentsMd = await readPodAgentsMdContent(auth, conversation.spaceId);
    if (agentsMd) {
      instructions += formatPodAgentsMdPromptSection(agentsMd);
    }
  }

  return instructions;
}
