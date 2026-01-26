import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types";
import type { AgentRetrievalOutputAnalyticsData } from "@app/types/assistant/analytics";
import type { ModelId } from "@app/types/shared/model_id";

import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { subDays } from "date-fns";
import { Op } from "sequelize";

import { TOOL_EXECUTION_BLOCKED_STATUSES } from "@app/lib/actions/statuses";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import {
  AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { sha256 } from "@app/types/shared/utils/hashing";

const BATCH_SIZE = 500;
const ES_BULK_CHUNK_SIZE = 1000;

function makeRetrievalOutputDocumentId({
  workspaceId,
  messageId,
  documentId,
  dataSourceViewId,
}: {
  workspaceId: string;
  messageId: string;
  documentId: string;
  dataSourceViewId: string;
}): string {
  const normalizedDocId = sha256(documentId);
  return `${workspaceId}_${messageId}_${dataSourceViewId}_${normalizedDocId}`;
}

async function bulkIndexToElasticsearch(
  documents: AgentRetrievalOutputAnalyticsData[],
  logger: Logger
): Promise<number> {
  if (documents.length === 0) {
    return 0;
  }

  let indexedCount = 0;

  for (let i = 0; i < documents.length; i += ES_BULK_CHUNK_SIZE) {
    const chunk = documents.slice(i, i + ES_BULK_CHUNK_SIZE);

    const result = await withEs(async (client) => {
      const bulkBody = chunk.flatMap((doc) => [
        {
          index: {
            _index: AGENT_DOCUMENT_OUTPUTS_ALIAS_NAME,
            _id: makeRetrievalOutputDocumentId({
              workspaceId: doc.workspace_id,
              messageId: doc.message_id,
              documentId: doc.document_id,
              dataSourceViewId: doc.data_source_view_id,
            }),
          },
        },
        doc,
      ]);

      await client.bulk({ body: bulkBody });
    });

    if (result.isErr()) {
      logger.error(
        {
          error: result.error,
          documentCount: chunk.length,
        },
        "[Backfill] Failed to write retrieval outputs to ES"
      );
      throw new Error(`ES bulk write failed: ${result.error.message}`);
    }

    indexedCount += chunk.length;
  }

  return indexedCount;
}

interface ActionWithContext {
  actionId: ModelId;
  workspaceId: ModelId;
  mcpServerConfigurationId: string;
  toolServerId: string;
  agentMessageId: ModelId;
  agentConfigurationId: string;
  agentConfigurationVersion: number;
  messageSId: string;
  messageCreatedAt: Date;
  conversationSId: string;
}

interface FetchActionsResult {
  actions: ActionWithContext[];
  lastRawActionId: ModelId | null;
  rawCount: number;
}

async function fetchActionsWithContext(
  workspaceId: ModelId,
  since: Date,
  lastId: ModelId | null,
  limit: number
): Promise<FetchActionsResult> {
  const rawActions = await AgentMCPActionModel.findAll({
    where: {
      workspaceId,
      createdAt: { [Op.gte]: since },
      status: { [Op.notIn]: TOOL_EXECUTION_BLOCKED_STATUSES },
      ...(lastId !== null ? { id: { [Op.gt]: lastId } } : {}),
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        include: [
          {
            model: MessageModel,
            as: "message",
            required: true,
            include: [
              {
                model: ConversationModel,
                as: "conversation",
                required: true,
              },
            ],
          },
        ],
      },
    ],
    order: [["id", "ASC"]],
    limit,
  });

  if (rawActions.length === 0) {
    return { actions: [], lastRawActionId: null, rawCount: 0 };
  }

  const lastRawActionId = rawActions[rawActions.length - 1].id;
  const results: ActionWithContext[] = [];

  for (const action of rawActions) {
    // Filter for server-side MCP tool configurations in code.
    if (!isLightServerSideMCPToolConfiguration(action.toolConfiguration)) {
      continue;
    }

    const agentMessage = action.agentMessage;
    const message = agentMessage?.message;
    const conversation = message?.conversation;

    if (!agentMessage || !message || !conversation) {
      continue;
    }

    results.push({
      actionId: action.id,
      workspaceId: action.workspaceId,
      mcpServerConfigurationId: action.mcpServerConfigurationId,
      toolServerId: action.toolConfiguration.toolServerId,
      agentMessageId: action.agentMessageId,
      agentConfigurationId: agentMessage.agentConfigurationId,
      agentConfigurationVersion: agentMessage.agentConfigurationVersion,
      messageSId: message.sId,
      messageCreatedAt: message.createdAt,
      conversationSId: conversation.sId,
    });
  }

  return { actions: results, lastRawActionId, rawCount: rawActions.length };
}

interface SearchResultData {
  actionId: ModelId;
  documentId: string;
  dataSourceViewId: string;
  dataSourceId: string;
}

function isSearchResultResource(content: {
  type: string;
  resource?: unknown;
}): content is {
  type: "resource";
  resource: {
    mimeType: string;
    id: string;
    source: {
      data_source_id?: string;
      data_source_view_id?: string;
    };
  };
} {
  if (content.type !== "resource" || typeof content.resource !== "object") {
    return false;
  }
  const resource = content.resource as Record<string, unknown>;
  return (
    resource !== null &&
    resource.mimeType ===
      INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT &&
    typeof resource.id === "string" &&
    typeof resource.source === "object" &&
    resource.source !== null
  );
}

async function fetchSearchResultsForActions(
  workspaceId: ModelId,
  actionIds: ModelId[]
): Promise<SearchResultData[]> {
  if (actionIds.length === 0) {
    return [];
  }

  const outputItems = await AgentMCPActionOutputItemModel.findAll({
    where: {
      workspaceId,
      agentMCPActionId: { [Op.in]: actionIds },
    },
    attributes: ["agentMCPActionId", "content"],
  });

  return outputItems.flatMap((item) => {
    const content = item.content;

    if (!isSearchResultResource(content)) {
      return [];
    }

    const dataSourceViewId = content.resource.source.data_source_view_id;
    const dataSourceId = content.resource.source.data_source_id;

    if (!dataSourceViewId || !dataSourceId) {
      return [];
    }

    return [
      {
        actionId: item.agentMCPActionId,
        documentId: content.resource.id,
        dataSourceViewId,
        dataSourceId,
      },
    ];
  });
}

// Global cache for DataSourceView sId → DataSource name.
const dataSourceNameCache = new Map<string, string>();

async function getDataSourceNames(
  workspaceId: ModelId,
  dataSourceViewSIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uncachedSIds: string[] = [];

  for (const sId of dataSourceViewSIds) {
    const cached = dataSourceNameCache.get(sId);
    if (cached !== undefined) {
      result.set(sId, cached);
    } else {
      uncachedSIds.push(sId);
    }
  }

  if (uncachedSIds.length === 0) {
    return result;
  }

  // Convert sIds to model IDs for querying.
  const sIdToModelId = new Map<string, ModelId>();
  for (const sId of uncachedSIds) {
    const modelId = getResourceIdFromSId(sId);
    if (modelId !== null) {
      sIdToModelId.set(sId, modelId);
    }
  }

  const modelIds = [...sIdToModelId.values()];
  if (modelIds.length === 0) {
    return result;
  }

  // Fetch uncached data source views with their data sources.
  const views = await DataSourceViewModel.findAll({
    where: {
      workspaceId,
      id: { [Op.in]: modelIds },
    },
    include: [
      {
        model: DataSourceModel,
        as: "dataSourceForView",
        required: true,
        attributes: ["name"],
      },
    ],
    attributes: ["id"],
  });

  // Build reverse lookup from modelId to sId.
  const modelIdToSId = new Map<ModelId, string>();
  for (const [sId, modelId] of sIdToModelId.entries()) {
    modelIdToSId.set(modelId, sId);
  }

  for (const view of views) {
    const name = view.dataSourceForView?.name;
    const sId = modelIdToSId.get(view.id);
    if (name && sId) {
      dataSourceNameCache.set(sId, name);
      result.set(sId, name);
    }
  }

  return result;
}

async function backfillForWorkspace(
  workspace: LightWorkspaceType,
  since: Date,
  execute: boolean,
  logger: Logger,
  globalStats: {
    totalRawActionsScanned: number;
    totalActionsMatched: number;
    totalDocumentsProduced: number;
    totalDocumentsIndexed: number;
  }
): Promise<void> {
  let lastActionId: ModelId | null = null;
  let workspaceRawActions = 0;
  let workspaceActionsMatched = 0;
  let workspaceDocuments = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { actions, lastRawActionId, rawCount } =
      await fetchActionsWithContext(
        workspace.id,
        since,
        lastActionId,
        BATCH_SIZE
      );

    if (rawCount === 0) {
      break;
    }

    lastActionId = lastRawActionId;
    workspaceRawActions += rawCount;
    workspaceActionsMatched += actions.length;

    if (actions.length === 0) {
      continue;
    }

    const actionMap = new Map(actions.map((a) => [a.actionId, a]));
    const actionIds = actions.map((a) => a.actionId);

    const searchResults = await fetchSearchResultsForActions(
      workspace.id,
      actionIds
    );

    if (searchResults.length === 0) {
      continue;
    }

    const uniqueDataSourceViewIds = [
      ...new Set(searchResults.map((r) => r.dataSourceViewId)),
    ];

    const dataSourceNames = await getDataSourceNames(
      workspace.id,
      uniqueDataSourceViewIds
    );

    const documents: AgentRetrievalOutputAnalyticsData[] =
      searchResults.flatMap((searchResult) => {
        const action = actionMap.get(searchResult.actionId);
        const dataSourceName = dataSourceNames.get(
          searchResult.dataSourceViewId
        );

        if (!action || !dataSourceName) {
          return [];
        }

        return [
          {
            message_id: action.messageSId,
            workspace_id: workspace.sId,
            conversation_id: action.conversationSId,
            agent_id: action.agentConfigurationId,
            agent_version: action.agentConfigurationVersion.toString(),
            timestamp: action.messageCreatedAt.toISOString(),
            mcp_server_configuration_id: action.mcpServerConfigurationId,
            mcp_server_name: action.toolServerId,
            data_source_view_id: searchResult.dataSourceViewId,
            data_source_id: searchResult.dataSourceId,
            data_source_name: dataSourceName,
            document_id: searchResult.documentId,
          },
        ];
      });

    workspaceDocuments += documents.length;

    if (execute && documents.length > 0) {
      await bulkIndexToElasticsearch(documents, logger);
    }
  }

  globalStats.totalRawActionsScanned += workspaceRawActions;
  globalStats.totalActionsMatched += workspaceActionsMatched;
  globalStats.totalDocumentsProduced += workspaceDocuments;
  if (execute) {
    globalStats.totalDocumentsIndexed += workspaceDocuments;
  }

  if (workspaceDocuments > 0) {
    logger.info(
      {
        workspaceId: workspace.sId,
        rawActions: workspaceRawActions,
        actionsMatched: workspaceActionsMatched,
        documents: workspaceDocuments,
      },
      "[Backfill] Workspace processed"
    );
  }
}

async function runBackfill(
  {
    execute,
    days,
    workspaceId,
  }: { execute: boolean; days: number; workspaceId?: string },
  logger: Logger
): Promise<void> {
  const since = subDays(new Date(), days);

  logger.info(
    {
      since: since.toISOString(),
      days,
      execute,
      workspaceId: workspaceId ?? "all",
    },
    "[Backfill] Starting agent document outputs backfill"
  );

  const globalStats = {
    totalRawActionsScanned: 0,
    totalActionsMatched: 0,
    totalDocumentsProduced: 0,
    totalDocumentsIndexed: 0,
  };

  if (workspaceId) {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    await backfillForWorkspace(
      renderLightWorkspaceType({ workspace }),
      since,
      execute,
      logger,
      globalStats
    );
  } else {
    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillForWorkspace(
          workspace,
          since,
          execute,
          logger,
          globalStats
        );
      },
      { concurrency: 4 }
    );
  }

  logger.info(
    {
      ...globalStats,
      execute,
      cacheSize: dataSourceNameCache.size,
    },
    "[Backfill] Completed agent document outputs backfill"
  );
}

makeScript(
  {
    days: {
      type: "number",
      demandOption: false,
      default: 30,
      description: "Backfill messages from the last N days (default: 30)",
    },
    workspaceId: {
      type: "string",
      demandOption: false,
      description: "Run on a single workspace (optional, sId)",
    },
  },
  runBackfill
);
