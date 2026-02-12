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
): Promise<ServerSideMCPServerConfigurationType[]> {
  const jitServers: ServerSideMCPServerConfigurationType[] = [];

  // Get conversation-specific MCP servers (tools).
  const conversationServers = await getConversationMCPServers(
    auth,
    conversation
  );
  jitServers.push(...conversationServers);

  // Get common utilities server.
  const commonUtilitiesServer = await getCommonUtilitiesServer(
    auth,
    agentConfiguration,
    conversation
  );
  if (commonUtilitiesServer) {
    jitServers.push(commonUtilitiesServer);
  }

  // Get skill management server (if applicable).
  const skillManagementServer = await getSkillManagementServer(
    auth,
    agentConfiguration,
    conversation
  );
  if (skillManagementServer) {
    jitServers.push(skillManagementServer);
  }

  // Get project search server (if in a project).
  const projectSearchServer = await getProjectSearchServer(auth, conversation);
  if (projectSearchServer) {
    jitServers.push(projectSearchServer);
  }

  // Get project manager server (if in a project).
  const projectManagerServer = await getProjectManagerServer(
    auth,
    conversation
  );
  if (projectManagerServer) {
    jitServers.push(projectManagerServer);
  }

  // Get project conversation server (if in a project).
  const projectConversationServer = await getProjectConversationServer(
    auth,
    conversation
  );
  if (projectConversationServer) {
    jitServers.push(projectConversationServer);
  }

  // Get schedules management server (if onboarding conversation).
  const schedulesManagementServer = await getSchedulesManagementServer(
    auth,
    agentConfiguration,
    conversation
  );
  if (schedulesManagementServer) {
    jitServers.push(schedulesManagementServer);
  }

  // If no attachments, return early.
  if (attachments.length === 0) {
    return jitServers;
  }

  // Get conversation files server.
  const conversationFilesServer = await getConversationFilesServer(
    auth,

    attachments
  );
  if (conversationFilesServer) {
    jitServers.push(conversationFilesServer);
  }

  // Get query tables server.
  const queryTablesServer = await getQueryTablesServer(
    auth,
    conversation,
    attachments
  );
  if (queryTablesServer) {
    jitServers.push(queryTablesServer);
  }

  // Get conversation search server.
  const conversationSearchServer = await getConversationSearchServer(
    auth,
    conversation,
    attachments
  );
  if (conversationSearchServer) {
    jitServers.push(conversationSearchServer);
  }

  // Get folder search servers.
  const folderSearchServers = await getFolderSearchServers(auth, attachments);
  jitServers.push(...folderSearchServers);

  return jitServers;
}
