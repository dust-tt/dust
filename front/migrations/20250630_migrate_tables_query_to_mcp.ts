// import { format } from "date-fns";
// import fs from "fs";
// import type { Logger } from "pino";
// import { Op } from "sequelize";
//
// import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/actions/constants";
// import { Authenticator } from "@app/lib/auth";
// import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
// import {
//   AgentTablesQueryAction,
//   AgentTablesQueryConfiguration,
// } from "@app/lib/models/assistant/actions/tables_query";
// import { AgentConfiguration } from "@app/lib/models/assistant/agent";
// import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
// import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
// import { generateRandomModelSId } from "@app/lib/resources/string_ids";
// import { concurrentExecutor } from "@app/lib/utils/async_utils";
// import { makeScript } from "@app/scripts/helpers";
// import type { AgentStatus, ModelId } from "@app/types";
//
// const CONFIGURATION_CONCURRENCY = 10;
//
// async function findWorkspacesWithTablesQueryConfigurations({
//   agentStatus,
// }: {
//   agentStatus: AgentStatus;
// }): Promise<ModelId[]> {
//   const tablesQueryConfigs = await AgentTablesQueryConfiguration.findAll({
//     attributes: ["workspaceId"],
//     include: [
//       {
//         model: AgentConfiguration,
//         required: true,
//         where: {
//           status: agentStatus,
//         },
//       },
//     ],
//   });
//
//   return tablesQueryConfigs.map((config) => config.workspaceId);
// }
//
// /**
//  * Migrates tables query actions from non-MCP to MCP version for a specific workspace.
//  */
// async function migrateWorkspaceTablesQueryActions(
//   auth: Authenticator,
//   {
//     execute,
//     parentLogger,
//     agentStatus,
//   }: {
//     execute: boolean;
//     parentLogger: Logger;
//     agentStatus: AgentStatus;
//   }
// ): Promise<string> {
//   const owner = auth.getNonNullableWorkspace();
//   const logger = parentLogger.child({
//     workspaceId: owner.sId,
//   });
//
//   logger.info("Starting migration of tables query actions to MCP.");
//
//   const tablesQueryConfigs = await AgentTablesQueryConfiguration.findAll({
//     where: {
//       workspaceId: owner.id,
//     },
//     include: [
//       {
//         model: AgentConfiguration,
//         required: true,
//         where: {
//           status: agentStatus,
//         },
//       },
//     ],
//   });
//
//   logger.info(
//     `Found ${tablesQueryConfigs.length} tables query configurations to migrate.`
//   );
//
//   // Create the MCP server views in system and global spaces.
//   await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
//
//   const mcpServerView =
//     await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
//       auth,
//       "query_tables"
//     );
//   if (!mcpServerView) {
//     throw new Error("Tables Query MCP server view not found.");
//   }
//
//   let revertSql = "";
//
//   // Replace each agent_tables_query_configuration with an MCP server configuration
//   // and link the corresponding agent_tables_query_configuration_tables to the MCP server configuration.
//   await concurrentExecutor(
//     tablesQueryConfigs,
//     async (tablesQueryConfig) => {
//       if (execute) {
//         // Create the MCP server configuration.
//         const mcpConfig = await AgentMCPServerConfiguration.create({
//           sId: generateRandomModelSId(),
//           agentConfigurationId: tablesQueryConfig.agentConfigurationId,
//           workspaceId: owner.id,
//           mcpServerViewId: mcpServerView.id,
//           internalMCPServerId: mcpServerView.internalMCPServerId,
//           additionalConfiguration: {},
//           timeFrame: null,
//           name:
//             tablesQueryConfig.name === DEFAULT_TABLES_QUERY_ACTION_NAME
//               ? null
//               : tablesQueryConfig.name,
//           singleToolDescriptionOverride: tablesQueryConfig.description,
//           appId: null,
//           jsonSchema: null,
//         });
//
//         // Reverse: create the tables query configuration.
//         revertSql +=
//           `INSERT INTO "agent_tables_query_configurations" ` +
//           `("id", "sId", "agentConfigurationId", "workspaceId", "name", "description", "createdAt", "updatedAt") ` +
//           `VALUES ('${tablesQueryConfig.id}', '${tablesQueryConfig.sId}', '${tablesQueryConfig.agentConfigurationId}', ` +
//           `'${tablesQueryConfig.workspaceId}', '${tablesQueryConfig.name}', '${tablesQueryConfig.description}', ` +
//           `'${format(tablesQueryConfig.createdAt, "yyyy-MM-dd")}', ` +
//           `'${format(tablesQueryConfig.updatedAt, "yyyy-MM-dd")}');\n`;
//
//         // Reverse: link to the tables query configuration instead of the MCP server configuration.
//         revertSql +=
//           `UPDATE "agent_tables_query_actions" ` +
//           `SET "tablesQueryConfigurationId" = '${tablesQueryConfig.sId}' ` +
//           `WHERE "tablesQueryConfigurationId" = '${mcpConfig.sId}';\n`;
//
//         // Update the actions to link to the new MCP server configuration.
//         await AgentTablesQueryAction.update(
//           {
//             tablesQueryConfigurationId: mcpConfig.sId,
//           },
//           {
//             where: {
//               tablesQueryConfigurationId: tablesQueryConfig.sId,
//             },
//           }
//         );
//
//         // Delete the tables query configuration.
//         await tablesQueryConfig.destroy();
//
//         // Reverse: delete the MCP server configuration.
//         revertSql += `DELETE FROM "agent_mcp_server_configurations" WHERE "id" = '${mcpConfig.id}';\n`;
//
//         logger.info(
//           {
//             tablesQueryConfigurationId: tablesQueryConfig.id,
//             mcpServerConfigurationId: mcpConfig.id,
//             agentConfigurationId: tablesQueryConfig.agentConfigurationId,
//           },
//           `Migrated tables query config to MCP server config.`
//         );
//       } else {
//         logger.info(
//           {
//             tablesQueryConfigurationId: tablesQueryConfig.id,
//             agentConfigurationId: tablesQueryConfig.agentConfigurationId,
//           },
//           `Would create MCP server config and migrate tables query config to it.`
//         );
//       }
//     },
//     { concurrency: CONFIGURATION_CONCURRENCY }
//   );
//
//   if (execute) {
//     logger.info(
//       `Successfully migrated ${tablesQueryConfigs.length} tables query configurations to MCP.`
//     );
//   } else {
//     logger.info(
//       `Would have migrated ${tablesQueryConfigs.length} tables query configurations to MCP.`
//     );
//   }
//
//   return revertSql;
// }
//
// makeScript(
//   {
//     startFromWorkspaceId: {
//       type: "number",
//       description: "Workspace ID to start from",
//       required: false,
//     },
//     agentStatus: {
//       type: "string",
//       description: "Agent status to filter on",
//       required: false,
//       default: "active",
//       choices: ["active", "archived", "draft"],
//     },
//   },
//   async ({ execute, startFromWorkspaceId, agentStatus }, parentLogger) => {
//     const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
//     let revertSql = "";
//
//     const workspaceIds = await findWorkspacesWithTablesQueryConfigurations({
//       agentStatus: agentStatus as AgentStatus,
//     });
//     const workspaces = await WorkspaceModel.findAll({
//       where: {
//         id: { [Op.in]: workspaceIds },
//         ...(startFromWorkspaceId
//           ? { id: { [Op.gte]: startFromWorkspaceId } }
//           : {}),
//       },
//       order: [["id", "ASC"]],
//     });
//
//     for (const workspace of workspaces) {
//       const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
//
//       const workspaceRevertSql = await migrateWorkspaceTablesQueryActions(
//         auth,
//         {
//           execute,
//           parentLogger,
//           agentStatus: agentStatus as AgentStatus,
//         }
//       );
//
//       if (execute) {
//         fs.writeFileSync(
//           `${now}_tables_query_to_mcp_revert_${workspace.sId}.sql`,
//           workspaceRevertSql
//         );
//       }
//       revertSql += workspaceRevertSql;
//     }
//
//     if (execute) {
//       fs.writeFileSync(`${now}_tables_query_to_mcp_revert_all.sql`, revertSql);
//     }
//   }
// );
