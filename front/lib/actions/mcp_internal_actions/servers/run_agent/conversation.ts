import type {
  ConversationPublicType,
  DustAPI,
  PublicPostContentFragmentRequestBody,
} from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import type { ChildAgentBlob } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import { isRunAgentResumeState } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import {
  fetchTableDataSourceConfigurations,
  getAgentDataSourceConfigurations,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  ConversationType,
  Result,
} from "@app/types";
import { DATA_SOURCE_NODE_ID, Err, Ok } from "@app/types";

function getDataSourceURI(config: DataSourceConfiguration): string {
  const { workspaceId, sId, dataSourceViewId, filter } = config;
  if (sId) {
    return `data_source_configuration://dust/w/${workspaceId}/data_source_configurations/${sId}`;
  }
  const encodedFilter = encodeURIComponent(JSON.stringify(filter));
  return `data_source_configuration://dust/w/${workspaceId}/data_source_views/${dataSourceViewId}/filter/${encodedFilter}`;
}

export async function createContentFragmentsFromDataSources(
  auth: Authenticator,
  mainAgent: AgentConfigurationType
): Promise<Result<PublicPostContentFragmentRequestBody[], Error>> {
  const searchActions = mainAgent.actions.filter(
    isServerSideMCPServerConfiguration
  );

  const allDataSources = searchActions.flatMap(
    (action) => action.dataSources ?? []
  );

  const allTables = searchActions.flatMap((action) => action.tables ?? []);

  // Convert DataSourceConfiguration to DataSourcesToolConfigurationType format.
  const dataSourceToolConfigurations = allDataSources.map((dataSource) => ({
    uri: getDataSourceURI(dataSource),
    mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
  }));

  // Convert TableDataSourceConfiguration to TablesToolConfigurationType format.
  const tableToolConfigurations = allTables.map((table) => ({
    uri: `table_configuration://dust/w/${table.workspaceId}/data_source_views/${table.dataSourceViewId}/tables/${table.tableId}`,
    mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
  }));

  // Resolve data source configurations to get actual data source IDs.
  const resolvedDataSourcesResult = await getAgentDataSourceConfigurations(
    auth,
    dataSourceToolConfigurations
  );

  if (resolvedDataSourcesResult.isErr()) {
    return resolvedDataSourcesResult;
  }

  const resolvedDataSources = resolvedDataSourcesResult.value;

  // Resolve table configurations to get actual table data.
  const resolvedTablesResult = await fetchTableDataSourceConfigurations(
    auth,
    tableToolConfigurations
  );

  if (resolvedTablesResult.isErr()) {
    return resolvedTablesResult;
  }

  const resolvedTables = resolvedTablesResult.value;

  const contentFragments: PublicPostContentFragmentRequestBody[] = [];

  // We need to iterate over the resolved data sources and the associated parent filter, and create a content fragment for each parent node.
  for (const dataSource of resolvedDataSources) {
    if (
      dataSource.filter.parents?.in &&
      dataSource.filter.parents.in.length > 0
    ) {
      // If there are specific parent filters, create content fragments for each parent node.
      for (const parentNodeId of dataSource.filter.parents.in) {
        contentFragments.push({
          title: `Node: ${parentNodeId}`,
          nodeId: parentNodeId, // Use the specific parent node ID
          nodeDataSourceViewId: dataSource.dataSourceViewId,
          url: null,
          content: null,
          contentType: null,
          context: null,
          supersededContentFragmentId: null,
        });
      }
    } else {
      // If no parent filters, create a content fragment for the entire data source.
      contentFragments.push({
        title: `Data Source: ${dataSource.dataSource.name}`,
        nodeId: DATA_SOURCE_NODE_ID, // Use the constant directly for data source nodes
        nodeDataSourceViewId: dataSource.dataSourceViewId,
        url: null,
        content: null,
        contentType: null,
        context: null,
        supersededContentFragmentId: null,
      });
    }
  }

  // Create content fragments for tables.
  for (const table of resolvedTables) {
    contentFragments.push({
      title: `Table: ${table.tableId}`,
      nodeId: table.tableId, // Use the table ID as the node ID
      nodeDataSourceViewId: table.dataSourceViewId,
      url: null,
      content: null,
      contentType: null,
      context: null,
      supersededContentFragmentId: null,
    });
  }

  return new Ok(contentFragments);
}

export async function getOrCreateConversation(
  api: DustAPI,
  agentLoopContext: AgentLoopRunContextType,
  {
    childAgentBlob,
    childAgentId,
    mainAgent,
    mainConversation,
    query,
    toolsetsToAdd,
    fileOrContentFragmentIds,
    conversationId,
    contentFragments,
  }: {
    childAgentBlob: ChildAgentBlob;
    childAgentId: string;
    mainAgent: AgentConfigurationType;
    mainConversation: ConversationType;
    query: string;
    toolsetsToAdd: string[] | null;
    fileOrContentFragmentIds: string[] | null;
    conversationId: string | null;
    contentFragments: PublicPostContentFragmentRequestBody[] | null;
  }
): Promise<
  Result<
    {
      conversation: ConversationPublicType;
      isNewConversation: boolean;
      userMessageId: string;
    },
    Error
  >
> {
  const { agentMessage, stepContext } = agentLoopContext;

  const { resumeState } = stepContext;
  if (resumeState && isRunAgentResumeState(resumeState)) {
    const convRes = await api.getConversation({
      conversationId: resumeState.conversationId,
    });

    if (convRes.isErr()) {
      return new Err(new Error("Failed to get conversation"));
    }

    return new Ok({
      conversation: convRes.value,
      isNewConversation: false,
      userMessageId: resumeState.userMessageId,
    });
  }

  const contentFragmentsToUse: PublicPostContentFragmentRequestBody[] =
    contentFragments ? [...contentFragments] : [];

  if (fileOrContentFragmentIds) {
    // Get all files from the current conversation and filter which one to pass to the sub agent
    const attachments = listAttachments(mainConversation);
    for (const attachment of attachments) {
      if (
        isFileAttachmentType(attachment) &&
        fileOrContentFragmentIds?.includes(attachment.fileId)
      ) {
        // Convert file attachment to content fragment
        contentFragmentsToUse.push({
          title: attachment.title,
          fileId: attachment.fileId,
          url: null,
          context: null,
        });
      } else if (
        isContentNodeAttachmentType(attachment) &&
        fileOrContentFragmentIds?.includes(attachment.contentFragmentId)
      ) {
        // Convert content node attachment to content fragment
        contentFragmentsToUse.push({
          title: attachment.title,
          nodeId: attachment.nodeId,
          nodeDataSourceViewId: attachment.nodeDataSourceViewId,
          context: null,
        });
      }
    }
  }

  if (conversationId) {
    // Post content fragments separately for existing conversations.
    if (contentFragmentsToUse.length > 0) {
      for (const contentFragment of contentFragmentsToUse) {
        const fragmentRes = await api.postContentFragment({
          conversationId,
          contentFragment,
        });

        if (fragmentRes.isErr()) {
          return new Err(new Error("Failed to post content fragment"));
        }
      }
    }

    const messageRes = await api.postUserMessage({
      conversationId,
      message: {
        content: `:mention[${childAgentBlob.name}]{sId=${childAgentId}} ${query}`,
        mentions: [{ configurationId: childAgentId }],
        context: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          username: mainAgent.name,
          fullName: `@${mainAgent.name}`,
          email: null,
          profilePictureUrl: mainAgent.pictureUrl,
          // `run_agent` origin will skip adding the conversation to the user history.
          origin:
            mainConversation.sId !== conversationId
              ? "run_agent"
              : "agent_handover",
          selectedMCPServerViewIds: toolsetsToAdd,
        },
      },
    });

    if (messageRes.isErr()) {
      return new Err(new Error("Failed to create message"));
    }

    const convRes = await api.getConversation({
      conversationId,
    });

    if (convRes.isErr()) {
      return new Err(new Error("Failed to get conversation"));
    }

    return new Ok({
      conversation: convRes.value,
      userMessageId: messageRes.value.sId,
      isNewConversation: true,
    });
  }

  const convRes = await api.createConversation({
    title: `run_agent ${mainAgent.name} > ${childAgentBlob.name}`,
    visibility: "unlisted",
    depth: mainConversation.depth + 1,
    message: {
      content: `:mention[${childAgentBlob.name}]{sId=${childAgentId}} ${query}`,
      mentions: [{ configurationId: childAgentId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        username: mainAgent.name,
        fullName: `@${mainAgent.name}`,
        email: null,
        profilePictureUrl: mainAgent.pictureUrl,
        // `run_agent` origin will skip adding the conversation to the user history.
        origin: "run_agent",
        selectedMCPServerViewIds: toolsetsToAdd,
      },
    },
    contentFragments: contentFragmentsToUse,
    skipToolsValidation: agentMessage.skipToolsValidation ?? false,
    params: {
      // TODO(DURABLE_AGENT 2025-08-20): Remove this if we decided to always use async mode.
      execution: "async",
    },
  });

  if (convRes.isErr()) {
    logger.error(
      {
        error: convRes.error,
        stepContext,
      },
      "Failed to create conversation"
    );

    return new Err(new Error("Failed to create conversation"));
  }

  const { conversation, message: createdUserMessage } = convRes.value;

  if (!createdUserMessage) {
    return new Err(new Error("Failed to retrieve the created message."));
  }

  return new Ok({
    conversation,
    isNewConversation: true,
    userMessageId: createdUserMessage.sId,
  });
}
