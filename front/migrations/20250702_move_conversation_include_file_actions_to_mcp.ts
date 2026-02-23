// import assert from "assert";
// import type { Logger } from "pino";
// import type { CreationAttributes } from "sequelize";
// import { Op } from "sequelize";
//
// import type { ActionBaseParams } from "@app/lib/actions/mcp";
// import { getAttachmentFromFile } from "@app/lib/api/assistant/conversation/attachments";
// import { getGlobalAgents } from "@app/lib/api/assistant/global_agents";
// import { getWorkspaceInfos } from "@app/lib/api/workspace";
// import { getSupportedModelConfig } from "@app/lib/assistant";
// import { Authenticator } from "@app/lib/auth";
// import { AgentConversationIncludeFileAction } from "@app/lib/models/assistant/actions/conversation/include_file";
// import {
//   AgentMCPAction,
//   AgentMCPActionOutputItem,
//   AgentMCPServerConfiguration,
// } from "@app/lib/models/assistant/actions/mcp";
// import { AgentConfiguration } from "@app/lib/models/assistant/agent";
// import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
// import { getContentFragmentFromAttachmentFile } from "@app/lib/resources/content_fragment_resource";
// import { FileResource } from "@app/lib/resources/file_resource";
// import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
// import { concurrentExecutor } from "@app/lib/utils/async_utils";
// import { makeScript } from "@app/scripts/helpers";
// import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
// import type { LightWorkspaceType, ModelConfigurationType } from "@app/types";
// import { stripNullBytes } from "@app/types";
// import { isGlobalAgentId, isImageContent, isTextContent } from "@app/types";
//
// const WORKSPACE_CONCURRENCY = 50;
// const BATCH_SIZE = 200;
// const CREATION_CONCURRENCY = 50;
//
// // Types for the resources that are output by the conversation_files MCP server.
// type ConversationFileOutputResource = {
//   uri: string;
//   mimeType: string;
//   text: string;
// };
//
// function agentConversationIncludeFileActionToAgentMCPAction(
//   includeFileAction: AgentConversationIncludeFileAction,
//   logger: Logger
// ): {
//   action: ActionBaseParams & CreationAttributes<AgentMCPAction>;
// } {
//   // For conversation include file actions, we always use the hardcoded -1 ID
//   // since they are always JIT actions.
//   const mcpServerConfigurationId = "-1";
//
//   logger.info(
//     {
//       includeFileActionId: includeFileAction.id,
//       mcpServerConfigurationId,
//     },
//     "Converted Conversation Include File action to MCP action"
//   );
//
//   return {
//     action: {
//       agentMessageId: includeFileAction.agentMessageId,
//       functionCallId: includeFileAction.functionCallId,
//       functionCallName: "conversation_files__include_file",
//       createdAt: includeFileAction.createdAt,
//       updatedAt: includeFileAction.updatedAt,
//       generatedFiles: [],
//       mcpServerConfigurationId,
//       params: { fileId: includeFileAction.fileId },
//       step: includeFileAction.step,
//       workspaceId: includeFileAction.workspaceId,
//       isError: false,
//       executionState: "allowed_implicitly",
//     },
//   };
// }
//
// function createOutputItem({
//   content,
//   agentMCPAction,
//   includeFileAction,
// }: {
//   content:
//     | { type: "text"; text: string }
//     | { type: "resource"; resource: ConversationFileOutputResource };
//   agentMCPAction: AgentMCPAction;
//   includeFileAction: AgentConversationIncludeFileAction;
// }): CreationAttributes<AgentMCPActionOutputItem> {
//   return {
//     agentMCPActionId: agentMCPAction.id,
//     content,
//     createdAt: includeFileAction.createdAt,
//     updatedAt: includeFileAction.updatedAt,
//     workspaceId: includeFileAction.workspaceId,
//   };
// }
//
// // Recreate the output as if it came from the conversation_files MCP server.
// async function getContentForConversationIncludeFileAction(
//   auth: Authenticator,
//   includeFileAction: AgentConversationIncludeFileAction,
//   model: ModelConfigurationType,
//   logger: Logger
// ): Promise<
//   | (
//       | { type: "text"; text: string }
//       | { type: "resource"; resource: ConversationFileOutputResource }
//     )
//   | null
// > {
//   const file = await FileResource.fetchById(auth, includeFileAction.fileId);
//   if (!file) {
//     logger.error(
//       {
//         includeFileActionId: includeFileAction.id,
//         fileId: includeFileAction.fileId,
//       },
//       "Failed to fetch file"
//     );
//     return null;
//   }
//
//   const { sId, fileName, contentType, snippet } = file;
//
//   // Copied from `listAttachments`.
//   const attachment = getAttachmentFromFile({
//     fileId: sId,
//     contentType,
//     title: fileName,
//     snippet,
//   });
//
//   // Copied from `fileFromConversation`/the MCP server (both do the same things but get the file from the conversation).
//   const contentResult = await getContentFragmentFromAttachmentFile(auth, {
//     attachment,
//     excludeImages: false,
//     model,
//   });
//   if (contentResult.isErr()) {
//     logger.error(
//       {
//         includeFileActionId: includeFileAction.id,
//         fileId: includeFileAction.fileId,
//       },
//       "Failed to get content fragment"
//     );
//     return null;
//   }
//
//   const content = contentResult.value.content[0];
//
//   if (isTextContent(content)) {
//     return {
//       type: "text",
//       text: stripNullBytes(content.text),
//     };
//   } else if (isImageContent(content)) {
//     // For images, we return the URL as a resource with the correct MIME type
//     return {
//       type: "resource",
//       resource: {
//         uri: content.image_url.url,
//         mimeType: attachment?.contentType || "application/octet-stream",
//         text: `Image: ${stripNullBytes(attachment.title)}`,
//       },
//     };
//   }
//
//   return null;
// }
//
// async function migrateSingleConversationIncludeFileAction(
//   auth: Authenticator,
//   includeFileAction: AgentConversationIncludeFileAction,
//   model: ModelConfigurationType,
//   logger: Logger,
//   {
//     execute,
//   }: {
//     execute: boolean;
//   }
// ) {
//   // Step 1: Convert the legacy Conversation Include File action to an MCP action
//   const mcpAction = agentConversationIncludeFileActionToAgentMCPAction(
//     includeFileAction,
//     logger
//   );
//
//   if (execute) {
//     // Step 2: Create the MCP action
//     const mcpActionCreated = await AgentMCPAction.create(mcpAction.action);
//
//     // Step 3: Create all output items (there's only 1)
//     const contentItem = await getContentForConversationIncludeFileAction(
//       auth,
//       includeFileAction,
//       model,
//       logger
//     );
//
//     let outputItem = null;
//     if (contentItem) {
//       outputItem = await AgentMCPActionOutputItem.create(
//         createOutputItem({
//           content: contentItem,
//           agentMCPAction: mcpActionCreated,
//           includeFileAction,
//         })
//       );
//     }
//
//     logger.info(
//       {
//         includeFileActionId: includeFileAction.id,
//         mcpActionId: mcpActionCreated.id,
//         outputItemId: outputItem?.id,
//         outputItemsCount: contentItem ? 1 : 0,
//       },
//       "Successfully migrated Conversation Include File action to MCP"
//     );
//   }
// }
//
// async function migrateWorkspaceConversationIncludeFileActions(
//   workspace: LightWorkspaceType,
//   logger: Logger,
//   { execute }: { execute: boolean }
// ) {
//   const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
//
//   await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
//
//   const mcpServerViewForConversationFiles =
//     await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
//       auth,
//       "conversation_files"
//     );
//
//   assert(
//     mcpServerViewForConversationFiles,
//     "Conversation Files MCP server view must exist"
//   );
//
//   let hasMore = false;
//   let lastId = 0;
//   do {
//     // Step 1: Retrieve the legacy Conversation Include File actions.
//     const includeFileActions = await AgentConversationIncludeFileAction.findAll(
//       {
//         where: {
//           workspaceId: workspace.id,
//           id: {
//             [Op.gt]: lastId,
//           },
//         },
//         limit: BATCH_SIZE,
//         order: [["id", "ASC"]],
//       }
//     );
//
//     if (includeFileActions.length === 0) {
//       return;
//     }
//
//     logger.info(
//       `Found ${includeFileActions.length} Conversation Include File actions`
//     );
//
//     // Step 2: Find the corresponding AgentMessages.
//     const agentMessages = await AgentMessage.findAll({
//       where: {
//         id: {
//           [Op.in]: includeFileActions.map((action) => action.agentMessageId),
//         },
//         workspaceId: workspace.id,
//       },
//       include: [
//         {
//           model: Message,
//           as: "message",
//           required: true,
//         },
//       ],
//     });
//
//     // Step 3: Find the corresponding AgentConfigurations.
//     const agentConfigurationSIds = [
//       ...new Set(agentMessages.map((message) => message.agentConfigurationId)),
//     ];
//
//     const agentConfigurations = await AgentConfiguration.findAll({
//       where: {
//         sId: {
//           [Op.in]: agentConfigurationSIds,
//         },
//         workspaceId: workspace.id,
//       },
//       include: [
//         {
//           model: AgentMCPServerConfiguration,
//           as: "mcpServerConfigurations",
//         },
//       ],
//     });
//
//     const agentConfigurationsMap = new Map(
//       agentConfigurations.map((config) => [
//         `${config.sId}-${config.version}`,
//         config,
//       ])
//     );
//
//     const agentMessagesMap = new Map(
//       agentMessages.map((message) => [message.id, message])
//     );
//
//     // Step 4: Create the MCP actions with their output items.
//     await concurrentExecutor(
//       includeFileActions,
//       async (includeFileAction) => {
//         const agentMessage = agentMessagesMap.get(
//           includeFileAction.agentMessageId
//         );
//         assert(agentMessage, "Agent message must exist");
//
//         if (agentMessage.agentConfigurationId === "deepseek") {
//           logger.error(
//             {
//               agentMessageId: agentMessage.id,
//               agentConfigurationId: agentMessage.agentConfigurationId,
//               agentConfigurationVersion: agentMessage.agentConfigurationVersion,
//             },
//             "Agent configuration deepseek does not exist anymore"
//           );
//           return;
//         }
//
//         const agentConfiguration = agentConfigurationsMap.get(
//           `${agentMessage.agentConfigurationId}-${agentMessage.agentConfigurationVersion}`
//         );
//         assert(
//           agentConfiguration ||
//             isGlobalAgentId(agentMessage.agentConfigurationId),
//           `Agent configuration must exist for agent ${agentMessage.agentConfigurationId}`
//         );
//
//         let model: ModelConfigurationType;
//         if (agentConfiguration) {
//           model = getSupportedModelConfig({
//             modelId: agentConfiguration.modelId,
//             providerId: agentConfiguration.providerId,
//           });
//         } else {
//           const [globalAgent] = await getGlobalAgents(auth, [
//             agentMessage.agentConfigurationId,
//           ]);
//           model = getSupportedModelConfig({ ...globalAgent.model });
//         }
//
//         await migrateSingleConversationIncludeFileAction(
//           auth,
//           includeFileAction,
//           model,
//           logger,
//           {
//             execute,
//           }
//         );
//       },
//       {
//         concurrency: CREATION_CONCURRENCY,
//       }
//     );
//
//     // Step 5: Delete the legacy Conversation Include File actions
//     if (execute) {
//       await AgentConversationIncludeFileAction.destroy({
//         where: {
//           id: {
//             [Op.in]: includeFileActions.map((action) => action.id),
//           },
//           workspaceId: workspace.id,
//         },
//       });
//     }
//
//     hasMore = includeFileActions.length === BATCH_SIZE;
//     lastId = includeFileActions[includeFileActions.length - 1].id;
//   } while (hasMore);
// }
//
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
//
//     if (workspaceId) {
//       const workspace = await getWorkspaceInfos(workspaceId);
//
//       if (!workspace) {
//         throw new Error(`Workspace ${workspaceId} not found`);
//       }
//
//       await migrateWorkspaceConversationIncludeFileActions(workspace, logger, {
//         execute,
//       });
//     } else {
//       await runOnAllWorkspaces(
//         async (workspace) =>
//           migrateWorkspaceConversationIncludeFileActions(
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
