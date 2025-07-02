// import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
// import assert from "assert";
// import type { Logger } from "pino";
// import type { CreationAttributes } from "sequelize";

// import { getWorkspaceInfos } from "@app/lib/api/workspace";
// import { Authenticator } from "@app/lib/auth";
// import {
//   AgentMCPAction,
//   AgentMCPActionOutputItem,
//   AgentMCPServerConfiguration,
// } from "@app/lib/models/assistant/actions/mcp";
// import {
//   AgentReasoningAction,
//   AgentReasoningConfiguration,
// } from "@app/lib/models/assistant/actions/reasoning";
// import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
// import { concurrentExecutor } from "@app/lib/utils/async_utils";
// import { makeScript } from "@app/scripts/helpers";
// import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
// import type { LightWorkspaceType } from "@app/types";

// const WORKSPACE_CONCURRENCY = 50;
// const BATCH_SIZE = 200;
// const CREATION_CONCURRENCY = 50;

// /**
//  * Loop through all reasoning actions and migrate them to MCP.
//  */
// async function migrateWorkspaceReasoningActions(
//   workspace: LightWorkspaceType,
//   logger: Logger,
//   { execute }: { execute: boolean }
// ) {
//   const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

//   // Get the MCP server view for reasoning.
//   await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
//   const mcpServerViewForReasoning =
//     await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
//       auth,
//       "reasoning"
//     );
//   assert(mcpServerViewForReasoning, "Reasoning MCP server view must exist");

//   let hasMore = true;

//   while (hasMore) {
//     // Get distinct reasoning configuration IDs that have actions.
//     const configsWithActions = await AgentReasoningAction.findAll({
//       where: {
//         workspaceId: workspace.id,
//       },
//       attributes: ["reasoningConfigurationId"],
//       group: ["reasoningConfigurationId"],
//       limit: BATCH_SIZE,
//       raw: true,
//     });

//     if (configsWithActions.length === 0) {
//       logger.info(
//         `No reasoning configurations with actions found in workspace ${workspace.sId}.`
//       );
//       hasMore = false;
//       break;
//     }

//     const configurationIds = configsWithActions.map(
//       (c) => c.reasoningConfigurationId
//     );

//     // Get the full reasoning configurations.
//     const reasoningConfigurations = await AgentReasoningConfiguration.findAll({
//       where: {
//         sId: configurationIds,
//         workspaceId: workspace.id,
//       },
//     });

//     logger.info(
//       `Processing batch: ${reasoningConfigurations.length} configurations in workspace ${workspace.sId}.`
//     );

//     // Step 2: Create the MCP actions with their output items.
//     await concurrentExecutor(
//       reasoningConfigurations,
//       async (reasoningConfiguration) => {
//         await migrateReasoningActionsForActionConfiguration({
//           workspace,
//           reasoningConfiguration,
//           mcpServerViewForReasoning: mcpServerViewForReasoning,
//           logger,
//           execute,
//         });
//       },
//       {
//         concurrency: CREATION_CONCURRENCY,
//       }
//     );
//   }
// }

// /**
//  * Migrate the actions for a single reasoning configuration.
//  */
// async function migrateReasoningActionsForActionConfiguration({
//   workspace,
//   reasoningConfiguration,
//   logger,
//   execute,
// }: {
//   workspace: LightWorkspaceType;
//   reasoningConfiguration: AgentReasoningConfiguration;
//   mcpServerViewForReasoning: MCPServerViewResource;
//   logger: Logger;
//   execute: boolean;
// }) {
//   // The reasoning configuration must have an MCP server configuration.
//   assert(
//     reasoningConfiguration.mcpServerConfigurationId,
//     "Reasoning configuration must have an MCP server configuration."
//   );

//   // Find the MCP server configuration.
//   const mcpServerConfiguration = await AgentMCPServerConfiguration.findByPk(
//     reasoningConfiguration.mcpServerConfigurationId
//   );
//   assert(mcpServerConfiguration, "MCP server configuration must exist");

//   const reasoningActions = await AgentReasoningAction.findAll({
//     where: {
//       reasoningConfigurationId: reasoningConfiguration.sId,
//       workspaceId: workspace.id,
//     },
//   });

//   if (reasoningActions.length === 0) {
//     logger.info(
//       { reasoningConfigurationId: reasoningConfiguration.id },
//       "No reasoning actions found for this configuration."
//     );
//     return;
//   }

//   // Create the MCP actions.
//   await concurrentExecutor(
//     reasoningActions,
//     async (reasoningAction) => {
//       await createMCPActionAndOutputItems({
//         mcpServerConfiguration,
//         reasoningAction,
//         logger,
//         execute,
//       });
//     },
//     {
//       concurrency: CREATION_CONCURRENCY,
//     }
//   );
// }

// /**
//  * Create the MCP action and the output items for a single reasoning action.
//  */
// async function createMCPActionAndOutputItems({
//   mcpServerConfiguration,
//   reasoningAction,
//   logger,
//   execute,
// }: {
//   mcpServerConfiguration: AgentMCPServerConfiguration;
//   reasoningAction: AgentReasoningAction;
//   logger: Logger;
//   execute: boolean;
// }) {
//   // Convert the legacy reasoning action to an MCP action.
//   const mcpActionParams: CreationAttributes<AgentMCPAction> = {
//     workspaceId: reasoningAction.workspaceId,
//     agentMessageId: reasoningAction.agentMessageId,
//     mcpServerConfigurationId: mcpServerConfiguration.id.toString(),
//     params: {},
//     functionCallId: reasoningAction.functionCallId,
//     functionCallName: reasoningAction.functionCallName,
//     step: reasoningAction.step,
//     executionState: "allowed_implicitly",
//     isError: false,
//   };

//   const outputItemThinking: AgentMCPActionOutputItem["content"] = {
//     type: "resource",
//     resource: {
//       text: reasoningAction.thinking ?? "",
//       uri: "",
//       mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.THINKING,
//     },
//   };

//   const outputItemContent: AgentMCPActionOutputItem["content"] = {
//     type: "resource",
//     resource: {
//       text: reasoningAction.output ?? "",
//       uri: "",
//       mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.REASONING_SUCCESS,
//     },
//   };

//   if (execute) {
//     // Create the MCP action.
//     const mcpAction = await AgentMCPAction.create(mcpActionParams);
//     // Create both output items concurrently.
//     await AgentMCPActionOutputItem.bulkCreate([
//       {
//         agentMCPActionId: mcpAction.id,
//         content: outputItemThinking,
//         createdAt: reasoningAction.createdAt,
//         updatedAt: reasoningAction.updatedAt,
//         workspaceId: reasoningAction.workspaceId,
//       },
//       {
//         agentMCPActionId: mcpAction.id,
//         content: outputItemContent,
//         createdAt: reasoningAction.createdAt,
//         updatedAt: reasoningAction.updatedAt,
//         workspaceId: reasoningAction.workspaceId,
//       },
//     ]);
//     // Delete the legacy reasoning action.
//     await reasoningAction.destroy();
//   } else {
//     logger.info(
//       {
//         reasoningActionId: reasoningAction.id,
//         mcpActionParams,
//         outputItemThinking,
//         outputItemContent,
//       },
//       "Would migrate reasoning action, but execute is false."
//     );
//   }
// }

// /**
//  * Migrates reasoning actions to MCP.
//  *
//  * @param workspaceId - The ID of the workspace to migrate. If not provided, all workspaces will be migrated.
//  * @param execute - Whether to execute the migration.
//  * @param logger - The logger to use.
//  */
// makeScript(
//   {
//     workspaceId: {
//       type: "string",
//       description: "Workspace ID to migrate",
//       required: false,
//     },
//   },
//   async ({ execute, workspaceId }, parentLogger) => {
//     const logger = parentLogger.child({ workspaceId });

//     if (workspaceId) {
//       const workspace = await getWorkspaceInfos(workspaceId);

//       if (!workspace) {
//         throw new Error(`Workspace ${workspaceId} not found`);
//       }

//       await migrateWorkspaceReasoningActions(workspace, logger, { execute });
//     } else {
//       await runOnAllWorkspaces(
//         async (workspace) =>
//           migrateWorkspaceReasoningActions(
//             workspace,
//             logger.child({ workspaceId: workspace.sId }),
//             {
//               execute,
//             }
//           ),
//         {
//           concurrency: WORKSPACE_CONCURRENCY,
//         }
//       );
//     }
//   }
// );
