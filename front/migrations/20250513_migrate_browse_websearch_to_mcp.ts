// import * as fs from "fs";
// import type { Logger } from "pino";

// import { Authenticator } from "@app/lib/auth";
// import { AgentBrowseConfiguration } from "@app/lib/models/assistant/actions/browse";
// import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
// import { AgentWebsearchConfiguration } from "@app/lib/models/assistant/actions/websearch";
// import { AgentConfiguration } from "@app/lib/models/assistant/agent";
// import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
// import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
// import { generateRandomModelSId } from "@app/lib/resources/string_ids";
// import type { AgentStatus } from "@app/types";

// import { makeScript } from "../scripts/helpers";

// async function migrateWorkspace(
//   workspace: WorkspaceModel,
//   logger: Logger,
//   { agentStatus, execute }: { agentStatus: AgentStatus; execute: boolean }
// ): Promise<string> {
//   // Create internal authenticator
//   const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

//   // Ensure all auto tools are created
//   await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

//   // Get MCP server view for the combined tool
//   const mcpServerView =
//     await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
//       auth,
//       "web_search_&_browse"
//     );

//   if (!mcpServerView) {
//     logger.error(
//       {
//         workspaceId: workspace.sId,
//       },
//       "Failed to get MCP server view for web_search_&_browse"
//     );
//     return "";
//   }

//   let revertSql = "";

//   // List all active agent configurations with browse or websearch
//   const agentConfigs = await AgentConfiguration.findAll({
//     where: {
//       workspaceId: workspace.id,
//       status: agentStatus,
//     },
//     include: [
//       {
//         model: AgentBrowseConfiguration,
//         required: false,
//         as: "browseConfigurations",
//       },
//       {
//         model: AgentWebsearchConfiguration,
//         required: false,
//         as: "websearchConfigurations",
//       },
//     ],
//   });

//   for (const agentConfig of agentConfigs) {
//     const hasBrowse = agentConfig.browseConfigurations.length > 0;
//     const hasWebsearch = agentConfig.websearchConfigurations.length > 0;

//     if (!hasBrowse && !hasWebsearch) {
//       continue;
//     }

//     logger.info(
//       {
//         workspaceId: workspace.sId,
//         agentConfigurationId: agentConfig.sId,
//         hasBrowse,
//         hasWebsearch,
//         execute,
//       },
//       "Migrating agent configuration"
//     );

//     if (execute) {
//       // Create MCP server configuration
//       const mcpServerConfig = await AgentMCPServerConfiguration.create({
//         sId: generateRandomModelSId(),
//         workspaceId: workspace.id,
//         agentConfigurationId: agentConfig.id,
//         mcpServerViewId: mcpServerView.id,
//         internalMCPServerId: mcpServerView.internalMCPServerId,
//         additionalConfiguration: {},
//         timeFrame: null,
//         jsonSchema: null,
//       });

//       revertSql += `DELETE FROM agent_mcp_server_configurations WHERE id = ${mcpServerConfig.id};`;

//       // Delete old configurations
//       for (const browseConfig of agentConfig.browseConfigurations) {
//         await browseConfig.destroy();
//         revertSql += `INSERT INTO agent_browse_configurations (id, created_at, updated_at, agent_configuration_id, name, description) VALUES (${browseConfig.id}, ${browseConfig.createdAt}, ${browseConfig.updatedAt}, ${agentConfig.id}, ${browseConfig.name}, ${browseConfig.description});`;
//       }
//       for (const websearchConfig of agentConfig.websearchConfigurations) {
//         await websearchConfig.destroy();
//         revertSql += `INSERT INTO agent_websearch_configurations (id, created_at, updated_at, agent_configuration_id, name, description) VALUES (${websearchConfig.id}, ${websearchConfig.createdAt}, ${websearchConfig.updatedAt}, ${agentConfig.id}, ${websearchConfig.name}, ${websearchConfig.description});`;
//       }

//       logger.info(
//         {
//           workspaceId: workspace.sId,
//           agentConfigurationId: agentConfig.sId,
//         },
//         "Successfully migrated agent configuration"
//       );
//     } else {
//       logger.info(
//         {
//           workspaceId: workspace.sId,
//           agentConfigurationId: agentConfig.sId,
//         },
//         "Would migrate agent configuration (dry run)"
//       );
//     }
//   }

//   return revertSql;
// }

// makeScript(
//   {
//     agentStatus: {
//       type: "string",
//       description: "Agent status to filter on",
//       required: false,
//       default: "active",
//       choices: ["active", "archived", "draft"],
//     },
//     workspaceId: {
//       type: "string",
//       describe:
//         "Optional workspace Id to migrate. If not provided, will migrate all workspaces.",
//     },
//   },
//   async ({ agentStatus, workspaceId, execute }, logger: Logger) => {
//     let revertSql = "";
//     if (workspaceId) {
//       const workspace = await WorkspaceModel.findOne({
//         where: {
//           sId: workspaceId,
//         },
//       });

//       if (!workspace) {
//         throw new Error(`Workspace ${workspaceId} not found`);
//       }

//       revertSql += await migrateWorkspace(workspace, logger, {
//         agentStatus: agentStatus as AgentStatus,
//         execute,
//       });
//     } else {
//       const workspaces = await WorkspaceModel.findAll();
//       logger.info(
//         {
//           workspaceCount: workspaces.length,
//         },
//         "Migrating all workspaces"
//       );

//       for (const workspace of workspaces) {
//         revertSql += await migrateWorkspace(workspace, logger, {
//           agentStatus: agentStatus as AgentStatus,
//           execute,
//         });
//       }
//     }
//     if (execute) {
//       const now = new Date().toISOString();
//       fs.writeFileSync(`websearch_to_mcp_revert_${now}.sql`, revertSql);
//     }
//   }
// );
