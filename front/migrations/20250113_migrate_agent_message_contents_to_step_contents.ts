import { Op } from "sequelize";

import { AgentBrowseAction } from "@app/lib/models/assistant/actions/browse";
import { AgentConversationIncludeFileAction } from "@app/lib/models/assistant/actions/conversation/include_file";
import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentProcessAction } from "@app/lib/models/assistant/actions/process";
import { AgentReasoningAction } from "@app/lib/models/assistant/actions/reasoning";
import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { AgentWebsearchAction } from "@app/lib/models/assistant/actions/websearch";
import { AgentMessageContent } from "@app/lib/models/assistant/agent_message_content";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
import type {
  FunctionCallContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

type ActionModelType =
  | AgentRetrievalAction
  | AgentDustAppRunAction
  | AgentTablesQueryAction
  | AgentProcessAction
  | AgentWebsearchAction
  | AgentBrowseAction
  | AgentMCPAction
  | AgentReasoningAction
  | AgentConversationIncludeFileAction;

type ActionType =
  | "retrieval"
  | "dustAppRun"
  | "tablesQuery"
  | "process"
  | "websearch"
  | "browse"
  | "mcp"
  | "reasoning"
  | "includeFile";

interface ActionWithMetadata {
  actionType: ActionType;
  action: ActionModelType;
  step: number;
  createdAt: Date;
}

async function fetchAllActionsForAgentMessages(
  agentMessageIds: number[],
  workspaceId: number
): Promise<Map<number, ActionWithMetadata[]>> {
  // Fetch from all action tables in parallel
  const [
    retrievalActions,
    dustAppRunActions,
    tablesQueryActions,
    processActions,
    websearchActions,
    browseActions,
    mcpActions,
    reasoningActions,
    includeFileActions,
  ] = await Promise.all([
    AgentRetrievalAction.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId,
      },
    }),
    AgentDustAppRunAction.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId,
      },
    }),
    AgentTablesQueryAction.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId,
      },
    }),
    AgentProcessAction.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId,
      },
    }),
    AgentWebsearchAction.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId,
      },
    }),
    AgentBrowseAction.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId,
      },
    }),
    AgentMCPAction.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId,
      },
    }),
    AgentReasoningAction.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId,
      },
    }),
    AgentConversationIncludeFileAction.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId,
      },
    }),
  ]);

  // Create a map to store actions by agentMessageId
  const actionsByAgentMessageId = new Map<number, ActionWithMetadata[]>();

  // Initialize empty arrays for each agent message
  agentMessageIds.forEach((id) => {
    actionsByAgentMessageId.set(id, []);
  });

  // Helper to add actions of a specific type to the map
  retrievalActions.forEach((action) => {
    const agentActions = actionsByAgentMessageId.get(action.agentMessageId);
    if (agentActions) {
      agentActions.push({
        actionType: "retrieval",
        action,
        step: action.step,
        createdAt: action.createdAt,
      });
    }
  });

  dustAppRunActions.forEach((action) => {
    const agentActions = actionsByAgentMessageId.get(action.agentMessageId);
    if (agentActions) {
      agentActions.push({
        actionType: "dustAppRun",
        action,
        step: action.step,
        createdAt: action.createdAt,
      });
    }
  });

  tablesQueryActions.forEach((action) => {
    const agentActions = actionsByAgentMessageId.get(action.agentMessageId);
    if (agentActions) {
      agentActions.push({
        actionType: "tablesQuery",
        action,
        step: action.step,
        createdAt: action.createdAt,
      });
    }
  });

  processActions.forEach((action) => {
    const agentActions = actionsByAgentMessageId.get(action.agentMessageId);
    if (agentActions) {
      agentActions.push({
        actionType: "process",
        action,
        step: action.step,
        createdAt: action.createdAt,
      });
    }
  });

  websearchActions.forEach((action) => {
    const agentActions = actionsByAgentMessageId.get(action.agentMessageId);
    if (agentActions) {
      agentActions.push({
        actionType: "websearch",
        action,
        step: action.step,
        createdAt: action.createdAt,
      });
    }
  });

  browseActions.forEach((action) => {
    const agentActions = actionsByAgentMessageId.get(action.agentMessageId);
    if (agentActions) {
      agentActions.push({
        actionType: "browse",
        action,
        step: action.step,
        createdAt: action.createdAt,
      });
    }
  });

  mcpActions.forEach((action) => {
    const agentActions = actionsByAgentMessageId.get(action.agentMessageId);
    if (agentActions) {
      agentActions.push({
        actionType: "mcp",
        action,
        step: action.step,
        createdAt: action.createdAt,
      });
    }
  });

  reasoningActions.forEach((action) => {
    const agentActions = actionsByAgentMessageId.get(action.agentMessageId);
    if (agentActions) {
      agentActions.push({
        actionType: "reasoning",
        action,
        step: action.step,
        createdAt: action.createdAt,
      });
    }
  });

  includeFileActions.forEach((action) => {
    const agentActions = actionsByAgentMessageId.get(action.agentMessageId);
    if (agentActions) {
      agentActions.push({
        actionType: "includeFile",
        action,
        step: action.step,
        createdAt: action.createdAt,
      });
    }
  });

  // Sort actions for each agent message by createdAt
  actionsByAgentMessageId.forEach((actions) => {
    actions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  });

  return actionsByAgentMessageId;
}

function createFunctionCallContent(
  actionWithMetadata: ActionWithMetadata
): FunctionCallContentType | null {
  const { actionType, action } = actionWithMetadata;

  try {
    let functionCall;

    switch (actionType) {
      case "retrieval": {
        // Build the function call directly from the database data
        const retrievalAction = action as AgentRetrievalAction;
        const params: {
          query?: string;
          relativeTimeFrame?: string;
          topK?: number;
          tagsIn?: string[];
          tagsNot?: string[];
        } = {};
        if (retrievalAction.query) {
          params.query = retrievalAction.query;
        }
        if (
          retrievalAction.relativeTimeFrameDuration &&
          retrievalAction.relativeTimeFrameUnit
        ) {
          params.relativeTimeFrame = `${retrievalAction.relativeTimeFrameDuration}${retrievalAction.relativeTimeFrameUnit}`;
        }
        if (retrievalAction.topK !== undefined) {
          params.topK = retrievalAction.topK;
        }
        if (retrievalAction.tagsIn && retrievalAction.tagsIn.length > 0) {
          params.tagsIn = retrievalAction.tagsIn;
        }
        if (retrievalAction.tagsNot && retrievalAction.tagsNot.length > 0) {
          params.tagsNot = retrievalAction.tagsNot;
        }

        functionCall = {
          id: retrievalAction.functionCallId || `call_${retrievalAction.id}`,
          name: retrievalAction.functionCallName || "search",
          arguments: JSON.stringify(params),
        };
        break;
      }
      case "dustAppRun": {
        const dustAppRunAction = action as AgentDustAppRunAction;
        functionCall = {
          id: dustAppRunAction.functionCallId || `call_${dustAppRunAction.id}`,
          name: dustAppRunAction.functionCallName || "run_dust_app",
          arguments: JSON.stringify(dustAppRunAction.params || {}),
        };
        break;
      }
      case "tablesQuery": {
        const tablesQueryAction = action as AgentTablesQueryAction;
        functionCall = {
          id:
            tablesQueryAction.functionCallId || `call_${tablesQueryAction.id}`,
          name: tablesQueryAction.functionCallName || "query_tables",
          arguments: JSON.stringify(tablesQueryAction.params || {}),
        };
        break;
      }
      case "process": {
        const processAction = action as AgentProcessAction;
        const processParams: {
          relativeTimeFrame?: { duration: number; unit: string } | null;
          tagsIn?: string[] | null;
          tagsNot?: string[] | null;
        } = {};

        if (
          processAction.relativeTimeFrameDuration &&
          processAction.relativeTimeFrameUnit
        ) {
          processParams.relativeTimeFrame = {
            duration: processAction.relativeTimeFrameDuration,
            unit: processAction.relativeTimeFrameUnit,
          };
        } else {
          processParams.relativeTimeFrame = null;
        }

        processParams.tagsIn = processAction.tagsIn;
        processParams.tagsNot = processAction.tagsNot;

        functionCall = {
          id: processAction.functionCallId || `call_${processAction.id}`,
          name:
            processAction.functionCallName ||
            "extract_structured_data_from_data_sources",
          arguments: JSON.stringify(processParams),
        };
        break;
      }
      case "websearch": {
        const websearchAction = action as AgentWebsearchAction;
        functionCall = {
          id: websearchAction.functionCallId || `call_${websearchAction.id}`,
          name: websearchAction.functionCallName || "websearch",
          arguments: JSON.stringify({ query: websearchAction.query }),
        };
        break;
      }
      case "browse": {
        const browseAction = action as AgentBrowseAction;
        functionCall = {
          id: browseAction.functionCallId || `call_${browseAction.id}`,
          name: browseAction.functionCallName || "browse",
          arguments: JSON.stringify({ urls: browseAction.urls }),
        };
        break;
      }
      case "mcp": {
        const mcpAction = action as AgentMCPAction;
        functionCall = {
          id: mcpAction.functionCallId || `call_${mcpAction.id}`,
          name: mcpAction.functionCallName || "mcp_tool",
          arguments: JSON.stringify(mcpAction.params || {}),
        };
        break;
      }
      case "reasoning": {
        const reasoningAction = action as AgentReasoningAction;
        functionCall = {
          id: reasoningAction.functionCallId || `call_${reasoningAction.id}`,
          name: reasoningAction.functionCallName || "thinking",
          arguments: "{}",
        };
        break;
      }
      case "includeFile": {
        const includeFileAction = action as AgentConversationIncludeFileAction;
        functionCall = {
          id:
            includeFileAction.functionCallId || `call_${includeFileAction.id}`,
          name: includeFileAction.functionCallName || "include_file",
          arguments: JSON.stringify({ fileId: includeFileAction.fileId }),
        };
        break;
      }
      default:
        return null;
    }

    return {
      type: "function_call",
      value: functionCall,
    };
  } catch (error) {
    // If there's an error creating the function call, log it and skip this action
    console.error(
      `Error creating function call for ${actionType} action ${action.id}:`,
      error
    );
    return null;
  }
}

async function migrateAgentMessageContentsAndActionsToStepContents(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  let lastSeenAgentMessageId = 0;
  const batchSize = 100; // Process 100 agent messages at a time
  let totalMessagesProcessed = 0;
  let totalContentsProcessed = 0;
  let totalContentsCreated = 0;
  let totalMessagesSkipped = 0;
  let totalActionsProcessed = 0;
  let totalActionsCreated = 0;
  const actionTypeCounts: Partial<Record<ActionType, number>> = {};

  logger.info({ workspaceId: workspace.sId }, "Starting migration");

  for (;;) {
    // Fetch agent messages that have content to migrate
    const agentMessagesWithContent = await AgentMessage.findAll({
      where: {
        id: { [Op.gt]: lastSeenAgentMessageId },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: AgentMessageContent,
          as: "agentMessageContents",
          required: false, // Include agent messages even without content
          where: {
            workspaceId: workspace.id,
          },
        },
      ],
      order: [["id", "ASC"]],
      limit: batchSize,
    });

    if (agentMessagesWithContent.length === 0) {
      break;
    }

    const agentMessageIds = agentMessagesWithContent.map((am) => am.id);

    // Check which agent messages already have step contents
    const existingStepContents = await AgentStepContentModel.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId: workspace.id,
      },
      attributes: ["agentMessageId"],
      group: ["agentMessageId"],
    });

    // Create a set of agent message IDs that already have step contents
    const agentMessagesWithStepContents = new Set(
      existingStepContents.map((sc) => sc.agentMessageId)
    );

    // Fetch all actions for all agent messages in this batch
    const actionsByAgentMessageId = await fetchAllActionsForAgentMessages(
      agentMessageIds,
      workspace.id
    );

    // Process each agent message
    for (const agentMessage of agentMessagesWithContent) {
      totalMessagesProcessed++;

      // Skip if this agent message already has step contents
      if (agentMessagesWithStepContents.has(agentMessage.id)) {
        totalMessagesSkipped++;
        logger.info(
          {
            workspaceId: workspace.sId,
            agentMessageId: agentMessage.id,
            contentCount: agentMessage.agentMessageContents?.length || 0,
          },
          "Skipping agent message - already has step contents"
        );
        continue;
      }

      const messageContents = agentMessage.agentMessageContents || [];
      totalContentsProcessed += messageContents.length;

      // Get actions for this agent message from the pre-fetched map
      const actions = actionsByAgentMessageId.get(agentMessage.id) || [];
      totalActionsProcessed += actions.length;

      // Track action types
      for (const action of actions) {
        actionTypeCounts[action.actionType] =
          (actionTypeCounts[action.actionType] || 0) + 1;
      }

      // Process both text contents and actions
      if (messageContents.length > 0 || actions.length > 0) {
        // Sort contents by ID to ensure consistent ordering
        const sortedContents = messageContents.sort((a, b) => a.id - b.id);

        // Group contents by step to assign proper indices
        const contentsByStep = new Map<number, AgentMessageContent[]>();
        for (const content of sortedContents) {
          const stepContents = contentsByStep.get(content.step) || [];
          stepContents.push(content);
          contentsByStep.set(content.step, stepContents);
        }

        // Group actions by step
        const actionsByStep = new Map<number, ActionWithMetadata[]>();
        for (const action of actions) {
          const stepActions = actionsByStep.get(action.step) || [];
          stepActions.push(action);
          actionsByStep.set(action.step, stepActions);
        }

        // Get all unique steps
        const allSteps = new Set([
          ...contentsByStep.keys(),
          ...actionsByStep.keys(),
        ]);

        // Prepare all step contents for this agent message
        const stepContentsToCreate: Array<{
          agentMessageId: number;
          step: number;
          index: number;
          type: "text_content" | "function_call";
          value: TextContentType | FunctionCallContentType;
          workspaceId: number;
          createdAt: Date;
          updatedAt: Date;
        }> = [];

        // Process each step
        for (const step of Array.from(allSteps).sort((a, b) => a - b)) {
          let currentIndex = 0;

          // First, add text contents for this step
          const stepTextContents = contentsByStep.get(step) || [];
          const sortedStepContents = stepTextContents.sort(
            (a, b) => a.id - b.id
          );

          for (const amc of sortedStepContents) {
            const textContent: TextContentType = {
              type: "text_content",
              value: amc.content,
            };

            stepContentsToCreate.push({
              agentMessageId: amc.agentMessageId,
              step: amc.step,
              index: currentIndex++,
              type: "text_content" as const,
              value: textContent,
              workspaceId: workspace.id,
              createdAt: amc.createdAt,
              updatedAt: amc.updatedAt,
            });
          }

          // Then, add actions for this step (sorted by createdAt)
          const stepActions = actionsByStep.get(step) || [];
          const sortedStepActions = stepActions.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
          );

          for (const actionWithMetadata of sortedStepActions) {
            const functionCallContent =
              createFunctionCallContent(actionWithMetadata);
            if (functionCallContent) {
              stepContentsToCreate.push({
                agentMessageId: agentMessage.id,
                step: actionWithMetadata.step,
                index: currentIndex++,
                type: "function_call" as const,
                value: functionCallContent,
                workspaceId: workspace.id,
                createdAt: actionWithMetadata.createdAt,
                updatedAt: actionWithMetadata.createdAt,
              });
            }
          }
        }

        logger.info(
          {
            workspaceId: workspace.sId,
            agentMessageId: agentMessage.id,
            textContentsToCreate: messageContents.length,
            actionsToCreate: actions.length,
            totalToCreate: stepContentsToCreate.length,
            execute,
          },
          "Step contents to create for agent message"
        );

        if (execute) {
          // Bulk create all step contents for this agent message.
          await AgentStepContentModel.bulkCreate(stepContentsToCreate);

          const textContentsCreated = stepContentsToCreate.filter(
            (sc) => sc.type === "text_content"
          ).length;
          const functionCallsCreated = stepContentsToCreate.filter(
            (sc) => sc.type === "function_call"
          ).length;

          totalContentsCreated += textContentsCreated;
          totalActionsCreated += functionCallsCreated;

          logger.info(
            {
              workspaceId: workspace.sId,
              agentMessageId: agentMessage.id,
              textContentsCreated,
              functionCallsCreated,
              totalCreated: stepContentsToCreate.length,
            },
            "Created step contents for agent message"
          );
        }
      }
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        messagesInBatch: agentMessagesWithContent.length,
        totalMessagesProcessed,
        totalMessagesSkipped,
        totalContentsProcessed,
        totalContentsCreated,
        totalActionsProcessed,
        totalActionsCreated,
      },
      "Completed batch"
    );

    lastSeenAgentMessageId =
      agentMessagesWithContent[agentMessagesWithContent.length - 1].id;
  }

  return {
    totalMessagesProcessed,
    totalMessagesSkipped,
    totalContentsProcessed,
    totalContentsCreated,
    totalActionsProcessed,
    totalActionsCreated,
    actionTypeCounts,
  };
}

async function migrateForWorkspace(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  logger.info(
    { workspaceId: workspace.sId, execute },
    "Starting workspace migration"
  );

  const {
    totalMessagesProcessed,
    totalMessagesSkipped,
    totalContentsProcessed,
    totalContentsCreated,
    totalActionsProcessed,
    totalActionsCreated,
    actionTypeCounts,
  } = await migrateAgentMessageContentsAndActionsToStepContents(workspace, {
    execute,
    logger,
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      totalMessagesProcessed,
      totalMessagesSkipped,
      totalContentsProcessed,
      totalContentsCreated,
      totalActionsProcessed,
      totalActionsCreated,
      actionTypeCounts,
    },
    "Completed workspace migration"
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(
    async (workspace) => {
      await migrateForWorkspace(workspace, { execute, logger });
    },
    { concurrency: 5 }
  );
});
