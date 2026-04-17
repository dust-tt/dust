import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { getCommonUtilitiesServer } from "@app/lib/api/assistant/jit/common_utilities";
import {
  getConversationFilesServer,
  getConversationMCPServers,
} from "@app/lib/api/assistant/jit/conversation";
import { getFolderSearchServers } from "@app/lib/api/assistant/jit/folder";
import { getQueryTablesServer } from "@app/lib/api/assistant/jit/query_tables_v2";
import { getSchedulesManagementServer } from "@app/lib/api/assistant/jit/schedules_management";
import { getSkillManagementServer } from "@app/lib/api/assistant/jit/skills";
import { isSearchableFolder } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
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
    autoInternalViews,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationWithoutContentType;
    autoInternalViews: Map<
      AutoInternalMCPServerNameType,
      MCPServerViewResource
    >;
  }
): Promise<ServerSideMCPServerConfigurationType[]> {
  const servers: (ServerSideMCPServerConfigurationType | null)[] = [];

  const commonUtilitiesServer = await getCommonUtilitiesServer(
    auth,
    agentConfiguration,
    conversation,
    autoInternalViews
  );
  servers.push(commonUtilitiesServer);

  const skillManagementServer = await getSkillManagementServer(
    auth,
    agentConfiguration,
    conversation,
    autoInternalViews
  );
  servers.push(skillManagementServer);

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
    autoInternalViews,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationWithoutContentType;
    attachments: ConversationAttachmentType[];
    autoInternalViews: Map<
      AutoInternalMCPServerNameType,
      MCPServerViewResource
    >;
  }
): Promise<ServerSideMCPServerConfigurationType[]> {
  const servers: (ServerSideMCPServerConfigurationType | null)[] = [];

  // Get conversation-specific MCP servers (tools), including those activated by this agent.
  const conversationServers = await getConversationMCPServers(
    auth,
    conversation,
    agentConfiguration.sId
  );
  servers.push(...conversationServers);

  // Add the schedules_management server, only applies to the onboarding conversation.
  const schedulesManagementServer = await getSchedulesManagementServer(
    auth,
    agentConfiguration,
    conversation,
    autoInternalViews
  );
  servers.push(schedulesManagementServer);

  // Add tools to manipulate conversation files, if any.

  if (attachments.length === 0) {
    return removeNulls(servers);
  }

  const conversationFilesServer = await getConversationFilesServer(
    auth,
    attachments,
    autoInternalViews
  );
  servers.push(conversationFilesServer);

  const queryTablesServer = await getQueryTablesServer(
    auth,
    conversation,
    attachments,
    autoInternalViews
  );
  servers.push(queryTablesServer);

  const folderSearchServers = await getFolderSearchServers(
    auth,
    attachments,
    autoInternalViews
  );
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
  const namesToFetch: AutoInternalMCPServerNameType[] = [
    "common_utilities",
    "skill_management",
    "schedules_management",
  ];
  if (attachments.length > 0) {
    namesToFetch.push("conversation_files");
    if (attachments.some((a) => a.isQueryable)) {
      namesToFetch.push("query_tables_v2");
    }
    if (
      attachments.some(
        (a) => isContentNodeAttachmentType(a) && isSearchableFolder(a)
      )
    ) {
      namesToFetch.push("search");
    }
  }

  const autoInternalViews =
    await MCPServerViewResource.getMCPServerViewsForAutoInternalToolsAsMap(
      auth,
      namesToFetch
    );

  const [baseServers, conditionalServers] = await Promise.all([
    getUnconditionalJITServers(auth, {
      agentConfiguration,
      conversation,
      autoInternalViews,
    }),
    getConditionalJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments,
      autoInternalViews,
    }),
  ]);

  return {
    servers: [...baseServers, ...conditionalServers],
    hasConditionalJITTools: conditionalServers.length > 0,
  };
}
