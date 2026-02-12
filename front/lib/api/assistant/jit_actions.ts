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
 * Servers whose tool specifications are always added.
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
  if (commonUtilitiesServer) {
    servers.push(commonUtilitiesServer);
  }

  // Get skill management server (if applicable).
  const skillManagementServer = await getSkillManagementServer(
    auth,
    agentConfiguration,
    conversation
  );
  if (skillManagementServer) {
    servers.push(skillManagementServer);
  }

  return servers;
}

/**
 * Servers whose presence depends on the conversation state (attached MCP
 * servers, project membership, attachments, etc.). They change the tool
 * specifications across conversations and bust the LLM cache.
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
  const servers: ServerSideMCPServerConfigurationType[] = [];

  // Get conversation-specific MCP servers (tools).
  const conversationServers = await getConversationMCPServers(
    auth,
    conversation
  );
  servers.push(...conversationServers);

  // Get project search server (if in a project).
  const projectSearchServer = await getProjectSearchServer(auth, conversation);
  if (projectSearchServer) {
    servers.push(projectSearchServer);
  }

  // Get project manager server (if in a project).
  const projectManagerServer = await getProjectManagerServer(
    auth,
    conversation
  );
  if (projectManagerServer) {
    servers.push(projectManagerServer);
  }

  // Get project conversation server (if in a project).
  const projectConversationServer = await getProjectConversationServer(
    auth,
    conversation
  );
  if (projectConversationServer) {
    servers.push(projectConversationServer);
  }

  // Get schedules management server (if onboarding conversation).
  const schedulesManagementServer = await getSchedulesManagementServer(
    auth,
    agentConfiguration,
    conversation
  );
  if (schedulesManagementServer) {
    servers.push(schedulesManagementServer);
  }

  // If no attachments, return early.
  if (attachments.length === 0) {
    return servers;
  }

  // Get conversation files server.
  const conversationFilesServer = await getConversationFilesServer(
    auth,

    attachments
  );
  if (conversationFilesServer) {
    servers.push(conversationFilesServer);
  }

  // Get query tables server.
  const queryTablesServer = await getQueryTablesServer(
    auth,
    conversation,
    attachments
  );
  if (queryTablesServer) {
    servers.push(queryTablesServer);
  }

  // Get conversation search server.
  const conversationSearchServer = await getConversationSearchServer(
    auth,
    conversation,
    attachments
  );
  if (conversationSearchServer) {
    servers.push(conversationSearchServer);
  }

  // Get folder search servers.
  const folderSearchServers = await getFolderSearchServers(auth, attachments);
  servers.push(...folderSearchServers);

  return servers;
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
  const baseServers = await getUnconditionalJITServers(auth, {
    agentConfiguration,
    conversation,
  });

  const conditionalServers = await getConditionalJITServers(auth, {
    agentConfiguration,
    conversation,
    attachments,
  });

  return {
    servers: [...baseServers, ...conditionalServers],
    hasConditionalJITTools: conditionalServers.length > 0,
  };
}
