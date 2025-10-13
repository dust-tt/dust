// @ts-nocheck
// This migration file references deleted process modules but has already been run in production
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { Logger } from "pino";
import type { CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import { DEFAULT_CONVERSATION_EXTRACT_ACTION_NAME } from "@app/lib/actions/constants";
import type { ActionBaseParams } from "@app/lib/actions/mcp";
import type {
  ExtractQueryResourceType,
  ExtractResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ProcessActionOutputsType } from "@app/lib/actions/process";
import config from "@app/lib/api/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType, ModelId, TimeFrame } from "@app/types";
import { isGlobalAgentId } from "@app/types";

const WORKSPACE_CONCURRENCY = 50;
const BATCH_SIZE = 200;
const CREATION_CONCURRENCY = 50;

const NOT_FOUND_MCP_SERVER_CONFIGURATION_ID = "unknown";

function getTimeFrameUnit(processAction: AgentProcessAction): TimeFrame | null {
  if (
    processAction.relativeTimeFrameUnit &&
    processAction.relativeTimeFrameDuration
  ) {
    return {
      duration: processAction.relativeTimeFrameDuration,
      unit: processAction.relativeTimeFrameUnit,
    };
  }

  return null;
}

function agentProcessActionToAgentMCPAction(
  processAction: AgentProcessAction,
  agentConfiguration: AgentConfiguration | null,
  mcpServerViewForExtractId: ModelId,
  logger: Logger
): {
  action: ActionBaseParams & CreationAttributes<AgentMCPAction>;
} {
  logger.info(
    {
      mcpServerViewForExtractId,
    },
    "Found MCP server view ID for extract_data"
  );

  const extractMcpServerConfiguration =
    agentConfiguration?.mcpServerConfigurations.find(
      (config) => config.mcpServerViewId === mcpServerViewForExtractId
    );

  const isJITServerAction =
    processAction.functionCallName === DEFAULT_CONVERSATION_EXTRACT_ACTION_NAME;

  // Determine the MCP server configuration ID to use.
  let mcpServerConfigurationId: string;

  if (isJITServerAction) {
    // For JIT server actions (default extract), use the hardcoded -1 ID like in the MCP
    // server implementation.
    mcpServerConfigurationId = "-1";
  } else {
    // For custom agent configurations, use the extract configuration.
    mcpServerConfigurationId =
      extractMcpServerConfiguration?.id.toString() ??
      NOT_FOUND_MCP_SERVER_CONFIGURATION_ID;
  }

  logger.info(
    {
      processActionId: processAction.id,
      mcpServerConfigurationId,
    },
    "Converted process action to MCP action"
  );

  const timeFrame = getTimeFrameUnit(processAction);

  return {
    action: {
      agentMessageId: processAction.agentMessageId,
      functionCallId: processAction.functionCallId,
      functionCallName: processAction.functionCallName,
      createdAt: processAction.createdAt,
      updatedAt: processAction.updatedAt,
      generatedFiles: processAction.jsonFileId
        ? [
            {
              fileId: processAction.jsonFileId.toString(),
              title: "Extracted Data",
              contentType: "application/json",
              snippet: processAction.jsonFileSnippet,
            },
          ]
        : [],
      mcpServerConfigurationId,
      params: {
        jsonSchema: processAction.jsonSchema,
        objective: "Extract structured information from documents",
        relativeTimeFrame: timeFrame
          ? `${timeFrame.duration}${timeFrame.unit}`
          : "all",
        tagsIn: processAction.tagsIn,
        tagsNot: processAction.tagsNot,
      },
      step: processAction.step,
      workspaceId: processAction.workspaceId,
      isError: false,
      executionState: "allowed_implicitly",
    },
  };
}

function createQueryOutputItem(
  processAction: AgentProcessAction,
  mcpActionId: ModelId
): CreationAttributes<AgentMCPActionOutputItem> {
  const timeFrame = getTimeFrameUnit(processAction);
  const timeFrameAsString = timeFrame
    ? "the last " +
      (timeFrame.duration > 1
        ? `${timeFrame.duration} ${timeFrame.unit}s`
        : `${timeFrame.unit}`)
    : "all time";

  const queryText = `Extracted from ${processAction.outputs?.total_documents} documents over ${timeFrameAsString}.\nObjective: Extract structured information from documents`;

  const queryResource: ExtractQueryResourceType = {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXTRACT_QUERY,
    text: queryText,
    uri: "",
  };

  return {
    agentMCPActionId: mcpActionId,
    content: {
      type: "resource",
      resource: queryResource,
    },
    createdAt: processAction.createdAt,
    updatedAt: processAction.updatedAt,
    workspaceId: processAction.workspaceId,
  };
}

function createResultOutputItem(
  processAction: AgentProcessAction,
  mcpActionId: ModelId,
  auth: Authenticator
): CreationAttributes<AgentMCPActionOutputItem> | null {
  if (!processAction.outputs || !processAction.jsonFileId) {
    return null;
  }

  const outputs = processAction.outputs as ProcessActionOutputsType;

  const extractResult =
    "PROCESSED OUTPUTS:\n" +
    (outputs.data && outputs.data.length > 0
      ? outputs.data.map((d) => JSON.stringify(d)).join("\n")
      : "(none)");

  const resultResource: ExtractResultResourceType = {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXTRACT_RESULT,
    text: extractResult,
    uri: `${config.getClientFacingUrl()}/api/w/${auth.getNonNullableWorkspace().sId}/files/${processAction.jsonFileId}`,
    fileId: processAction.jsonFileId.toString(),
    title: "Extracted Data",
    contentType: "application/json",
    snippet: processAction.jsonFileSnippet,
  };

  return {
    agentMCPActionId: mcpActionId,
    content: {
      type: "resource",
      resource: resultResource,
    },
    createdAt: processAction.createdAt,
    updatedAt: processAction.updatedAt,
    workspaceId: processAction.workspaceId,
  };
}

async function migrateSingleProcessAction(
  auth: Authenticator,
  agentMessage: AgentMessage,
  processAction: AgentProcessAction,
  agentConfiguration: AgentConfiguration | null,
  logger: Logger,
  {
    execute,
    mcpServerViewForExtractId,
  }: {
    execute: boolean;
    mcpServerViewForExtractId: ModelId;
  }
) {
  // Step 1: Convert the legacy process action to an MCP action.
  const mcpAction = agentProcessActionToAgentMCPAction(
    processAction,
    agentConfiguration ?? null,
    mcpServerViewForExtractId,
    logger
  );

  logger.info(
    {
      processActionId: processAction.id,
      outputs: processAction.outputs ? "has outputs" : "no outputs",
    },
    "Found process action outputs"
  );

  if (execute) {
    // Step 2: Create the MCP action.
    const mcpActionCreated = await AgentMCPActionModel.create(mcpAction.action);

    // Step 3: Create the MCP action output items.
    const outputItems: CreationAttributes<AgentMCPActionOutputItem>[] = [];

    // Create the query resource.
    outputItems.push(createQueryOutputItem(processAction, mcpActionCreated.id));

    // Create the result resource if outputs exist.
    const resultItem = createResultOutputItem(
      processAction,
      mcpActionCreated.id,
      auth
    );
    if (resultItem) {
      outputItems.push(resultItem);
    }

    await AgentMCPActionOutputItem.bulkCreate(outputItems);
  }
}

async function migrateWorkspaceProcessActions(
  workspace: LightWorkspaceType,
  logger: Logger,
  { execute }: { execute: boolean }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  const mcpServerViewForExtract =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "extract_data"
    );

  assert(mcpServerViewForExtract, "Extract data MCP server view must exist");

  let hasMore = false;
  do {
    // Step 1: Retrieve the legacy process actions.
    const processActions = await AgentProcessAction.findAll({
      where: {
        workspaceId: workspace.id,
      },
      limit: BATCH_SIZE,
    });

    if (processActions.length === 0) {
      return;
    }

    logger.info(`Found ${processActions.length} process actions`);

    // Step 2: Find the corresponding AgentMessages.
    const agentMessages = await AgentMessage.findAll({
      where: {
        id: {
          [Op.in]: processActions.map((action) => action.agentMessageId),
        },
        workspaceId: workspace.id,
      },
    });

    // Step 3: Find the corresponding AgentConfigurations.
    const agentConfigurationSIds = [
      ...new Set(agentMessages.map((message) => message.agentConfigurationId)),
    ];

    const agentConfigurations = await AgentConfiguration.findAll({
      where: {
        sId: {
          [Op.in]: agentConfigurationSIds,
        },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: AgentMCPServerConfiguration,
          as: "mcpServerConfigurations",
        },
      ],
    });

    const agentConfigurationsMap = new Map(
      agentConfigurations.map((config) => [
        `${config.sId}-${config.version}`,
        config,
      ])
    );

    const agentMessagesMap = new Map(
      agentMessages.map((message) => [message.id, message])
    );

    // Step 4: Create the MCP actions with their output items.
    await concurrentExecutor(
      processActions,
      async (processAction) => {
        const agentMessage = agentMessagesMap.get(processAction.agentMessageId);
        assert(agentMessage, "Agent message must exist");

        const agentConfiguration = agentConfigurationsMap.get(
          `${agentMessage.agentConfigurationId}-${agentMessage.agentConfigurationVersion}`
        );
        assert(
          agentConfiguration ||
            isGlobalAgentId(agentMessage.agentConfigurationId) ||
            // Dust Next is a global agent that was removed from everywhere.
            agentMessage.agentConfigurationId === "dust-next",
          `Agent configuration must exist for agent ${agentMessage.agentConfigurationId}`
        );

        await migrateSingleProcessAction(
          auth,
          agentMessage,
          processAction,
          agentConfiguration ?? null,
          logger,
          {
            execute,
            mcpServerViewForExtractId: mcpServerViewForExtract.id,
          }
        );
      },
      {
        concurrency: CREATION_CONCURRENCY,
      }
    );

    // Step 5: Delete the legacy process actions.
    if (execute) {
      await AgentProcessAction.destroy({
        where: {
          id: {
            [Op.in]: processActions.map((action) => action.id),
          },
          workspaceId: workspace.id,
        },
      });
    }

    hasMore = processActions.length === BATCH_SIZE;
  } while (hasMore);
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace ID to migrate",
      required: false,
    },
  },
  async ({ execute, workspaceId }, parentLogger) => {
    const logger = parentLogger.child({ workspaceId });

    if (workspaceId) {
      const workspace = await getWorkspaceInfos(workspaceId);

      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      await migrateWorkspaceProcessActions(workspace, logger, { execute });
    } else {
      await runOnAllWorkspaces(
        async (workspace) =>
          migrateWorkspaceProcessActions(
            workspace,
            logger.child({ workspaceId: workspace.sId }),
            {
              execute,
            }
          ),
        {
          concurrency: WORKSPACE_CONCURRENCY,
        }
      );
    }
  }
);
