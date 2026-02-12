import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { getCommonUtilitiesServer } from "@app/lib/api/assistant/jit/common_utilities";
import {
  getConversationFilesServer,
  getConversationMCPServers,
  getConversationSearchServer,
} from "@app/lib/api/assistant/jit/conversation";
import { getFolderSearchServers } from "@app/lib/api/assistant/jit/folder";
import { getProjectConversationServer } from "@app/lib/api/assistant/jit/project_conversation";
import { getProjectManagerServer } from "@app/lib/api/assistant/jit/project_manager";
import { getProjectSearchServer } from "@app/lib/api/assistant/jit/projects";
import { getQueryTablesServer } from "@app/lib/api/assistant/jit/query_tables_v2";
import { getSchedulesManagementServer } from "@app/lib/api/assistant/jit/schedules_management";
import { getSkillManagementServer } from "@app/lib/api/assistant/jit/skills";
import type { Authenticator } from "@app/lib/auth";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { removeNulls } from "@app/types/shared/utils/general";

/**
 * Servers whose tool specifications are mostly always added or never added.
 */
async function getUnconditionalJITServers(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationWithoutContentType;
  }
): Promise<ServerSideMCPServerConfigurationType[]> {
  const servers: (ServerSideMCPServerConfigurationType | null)[] = [];

  const commonUtilitiesServer = await getCommonUtilitiesServer(
    auth,
    agentConfiguration,
    conversation
  );
  servers.push(commonUtilitiesServer);

  const skillManagementServer = await getSkillManagementServer(
    auth,
    agentConfiguration,
    conversation
  );
  servers.push(skillManagementServer);

  // Add the three project servers if the conversation belongs to a project.

  const projectSearchServer = await getProjectSearchServer(auth, conversation);
  servers.push(projectSearchServer);

  const projectManagerServer = await getProjectManagerServer(
    auth,
    conversation
  );
  servers.push(projectManagerServer);

  const projectConversationServer = await getProjectConversationServer(
    auth,
    conversation
  );
  servers.push(projectConversationServer);

  return removeNulls(servers);
}

/**
 * Servers whose presence depends heavily on the conversation state and may change mid-conversation.
 */
async function getConditionalJITServers(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
    attachments,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationWithoutContentType;
    attachments: ConversationAttachmentType[];
  }
): Promise<ServerSideMCPServerConfigurationType[]> {
  const servers: (ServerSideMCPServerConfigurationType | null)[] = [];

  // Get conversation-specific MCP servers (tools).
  const conversationServers = await getConversationMCPServers(
    auth,
    conversation
  );
  servers.push(...conversationServers);

  // Add the schedules_management server, only applies to the onboarding conversation.
  const schedulesManagementServer = await getSchedulesManagementServer(
    auth,
    agentConfiguration,
    conversation
  );
  servers.push(schedulesManagementServer);

  // Add tools to manipulate conversation files, if any.

  if (attachments.length === 0) {
    return removeNulls(servers);
  }

  const conversationFilesServer = await getConversationFilesServer(
    auth,

    attachments
  );
  servers.push(conversationFilesServer);

  const queryTablesServer = await getQueryTablesServer(
    auth,
    conversation,
    attachments
  );
  servers.push(queryTablesServer);

  const conversationSearchServer = await getConversationSearchServer(
    auth,
    conversation,
    attachments
  );
  servers.push(conversationSearchServer);

  const folderSearchServers = await getFolderSearchServers(auth, attachments);
  servers.push(...folderSearchServers);

  return removeNulls(servers);
}

export async function getJITServers(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
    attachments,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationWithoutContentType;
    attachments: ConversationAttachmentType[];
  }
): Promise<{
  servers: ServerSideMCPServerConfigurationType[];
  hasConditionalJITTools: boolean;
}> {
  const [baseServers, conditionalServers] = await Promise.all([
    getUnconditionalJITServers(auth, { agentConfiguration, conversation }),
    getConditionalJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments,
    }),
  ]);

  return {
    servers: [...baseServers, ...conditionalServers],
    hasConditionalJITTools: conditionalServers.length > 0,
  };
}
