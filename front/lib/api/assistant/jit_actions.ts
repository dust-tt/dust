import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { getAskUserQuestionServer } from "@app/lib/api/assistant/jit/ask_user_question";
import { getCommonUtilitiesServer } from "@app/lib/api/assistant/jit/common_utilities";
import {
  getConversationFilesServer,
  getConversationMCPServers,
} from "@app/lib/api/assistant/jit/conversation";
import { getFilesServer } from "@app/lib/api/assistant/jit/files";
import { getFolderSearchServers } from "@app/lib/api/assistant/jit/folder";
import { getQueryTablesServer } from "@app/lib/api/assistant/jit/query_tables_v2";
import { getSkillManagementServer } from "@app/lib/api/assistant/jit/skills";
import { getTriggersManagementServer } from "@app/lib/api/assistant/jit/triggers_management";
import { isSearchableFolder } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { ConversationAttachmentType } from "@app/types/api/assistant/conversation/attachments";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { removeNulls } from "@app/types/shared/utils/general";

const ALWAYS_PREFETCHED_MCP_SERVERS: AutoInternalMCPServerNameType[] = [
  "ask_user_question",
  "common_utilities",
  "files",
  "triggers_management",
  "skill_management",
];

type ConditionalMCPServerContext = {
  attachments: ConversationAttachmentType[];
};

const CONDITIONAL_MCP_SERVER_NAMES = [
  "conversation_files",
  "query_tables_v2",
  "search",
] as const;

type ConditionalMCPServerName = (typeof CONDITIONAL_MCP_SERVER_NAMES)[number];

/**
 * Eligibility for attachment-dependent JIT servers. Decided once in getJITServers;
 * getConditionalJITServers only materializes servers whose views were prefetched.
 */
const CONDITIONAL_MCP_SERVERS: Record<
  ConditionalMCPServerName,
  (ctx: ConditionalMCPServerContext) => boolean
> = {
  // Note there is an additional filtering on the tools (see: front/lib/api/actions/servers/conversation_files/index.ts)
  conversation_files: ({ attachments }) => attachments.length > 0,
  // `isQueryable` already accounts for Computer availability and for the file explorer, so file
  // attachments only reach here in legacy conversations without the sandbox.
  query_tables_v2: ({ attachments }) => attachments.some((a) => a.isQueryable),
  // Folder search is distinct from attachment.isSearchable (conversation semantic search).
  search: ({ attachments }) =>
    attachments.some(
      (a) => isContentNodeAttachmentType(a) && isSearchableFolder(a)
    ),
};

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
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
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

  const skillManagementServer = getSkillManagementServer(
    agentConfiguration,
    conversation,
    autoInternalViews
  );
  servers.push(skillManagementServer);

  const filesServer = getFilesServer(
    agentConfiguration,
    conversation,
    autoInternalViews
  );
  servers.push(filesServer);

  const askUserQuestionServer = getAskUserQuestionServer(
    agentConfiguration,
    conversation,
    autoInternalViews
  );
  servers.push(askUserQuestionServer);

  return removeNulls(servers);
}

/**
 * Servers whose presence depends heavily on the conversation state and may change mid-conversation.
 * Prefetch via CONDITIONAL_MCP_SERVERS is the source of truth for which of these to build.
 */
async function getConditionalJITServers(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
    attachments,
    autoInternalViews,
  }: {
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
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

  // Add the triggers_management server, only applies to the onboarding conversation.
  const triggersManagementServer = await getTriggersManagementServer(
    auth,
    agentConfiguration,
    conversation,
    autoInternalViews
  );
  servers.push(triggersManagementServer);

  if (autoInternalViews.has("conversation_files")) {
    servers.push(await getConversationFilesServer(auth, autoInternalViews));
  }

  if (autoInternalViews.has("query_tables_v2")) {
    servers.push(
      await getQueryTablesServer(
        auth,
        conversation,
        attachments,
        autoInternalViews
      )
    );
  }

  if (autoInternalViews.has("search")) {
    servers.push(
      ...(await getFolderSearchServers(auth, attachments, autoInternalViews))
    );
  }

  return removeNulls(servers);
}

export async function getJITServers(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
    attachments,
  }: {
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
    conversation: ConversationWithoutContentType;
    attachments: ConversationAttachmentType[];
  }
): Promise<ServerSideMCPServerConfigurationType[]> {
  const mcpServersToFetch = new Set<AutoInternalMCPServerNameType>(
    ALWAYS_PREFETCHED_MCP_SERVERS
  );

  const conditionalContext: ConditionalMCPServerContext = {
    attachments,
  };
  for (const name of CONDITIONAL_MCP_SERVER_NAMES) {
    if (CONDITIONAL_MCP_SERVERS[name](conditionalContext)) {
      mcpServersToFetch.add(name);
    }
  }

  const autoInternalViews =
    await MCPServerViewResource.getMCPServerViewsForAutoInternalToolsAsMap(
      auth,
      Array.from(mcpServersToFetch)
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

  return [...baseServers, ...conditionalServers];
}
