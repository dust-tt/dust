// import type { Logger } from "pino";
//
// import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
// import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
// import { Authenticator } from "@app/lib/auth";
// import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
// import { makeScript } from "@app/scripts/helpers";
// import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
//
// async function deleteThinkToolFromWorkspace(
//   workspaceId: string,
//   { execute }: { execute: boolean },
//   logger: Logger
// ) {
//   logger.info(`Processing workspace ${workspaceId}`);
//
//   const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
//
//   const thinkToolId = autoInternalMCPServerNameToSId({
//     name: "think",
//     workspaceId: auth.getNonNullableWorkspace().id,
//   });
//
//   const mcpServerViews = await MCPServerViewResource.listByMCPServer(
//     auth,
//     thinkToolId
//   );
//
//   if (mcpServerViews.length === 0) {
//     logger.info("No think tool MCP server views found");
//     return;
//   }
//
//   logger.info(
//     { workspaceId },
//     `Found ${mcpServerViews.length} MCP server views for think tool`
//   );
//
//   if (execute) {
//     for (const view of mcpServerViews) {
//       await view.hardDelete(auth);
//     }
//     logger.info("Think tool successfully deleted");
//   } else {
//     logger.info("Dry run - would delete think tool and all dependencies");
//   }
// }
//
// makeScript({}, async ({ execute }, logger) => {
//   logger.info(`Think tool internal ID: ${INTERNAL_MCP_SERVERS["think"].id}`);
//
//   await runOnAllWorkspaces(async (workspace) => {
//     await deleteThinkToolFromWorkspace(
//       workspace.sId,
//       { execute },
//       logger.child({ workspaceId: workspace.sId })
//     );
//   });
//
//   logger.info("Think tool successfully deleted");
// });
