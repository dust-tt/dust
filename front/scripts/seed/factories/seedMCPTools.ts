import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceResource as SpaceResourceClass } from "@app/lib/resources/space_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";

import type { SeedContext } from "./types";

const GLOBAL_MCP_NAME = "Global Fake MCP Tool";
const RESTRICTED_MCP_NAME = "Restricted Fake MCP Tool";
const FAKE_MCP_URL = "https://fake-mcp-endpoint.example.com";

export async function seedMCPTools(
  ctx: SeedContext,
  restrictedSpace: SpaceResource | undefined
): Promise<void> {
  const { auth, workspace, execute, logger } = ctx;

  // Check for existing MCP servers
  const existingMCPServers =
    await RemoteMCPServerResource.listByWorkspace(auth);
  const existingGlobalMCP = existingMCPServers.find(
    (s) => s.cachedName === GLOBAL_MCP_NAME
  );
  const existingRestrictedMCP = existingMCPServers.find(
    (s) => s.cachedName === RESTRICTED_MCP_NAME
  );

  // Create global MCP tool (available in global space)
  if (existingGlobalMCP) {
    logger.info(
      { sId: existingGlobalMCP.sId },
      "Global MCP tool already exists, skipping"
    );
  } else if (execute) {
    logger.info({ name: GLOBAL_MCP_NAME }, "Creating global MCP tool");

    // Create the remote MCP server using factory
    const globalMCPServer = await RemoteMCPServerFactory.create(
      renderLightWorkspaceType({ workspace }),
      {
        name: GLOBAL_MCP_NAME,
        url: `${FAKE_MCP_URL}/global`,
        description: "A fake MCP tool available globally to all users",
        tools: [
          {
            name: "global_action",
            description: "A fake global action for testing",
            inputSchema: undefined,
          },
        ],
      }
    );

    // Get the system view that was automatically created
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        globalMCPServer.sId
      );

    if (systemView) {
      // Create a view in the global space to make it available to everyone
      const globalSpace =
        await SpaceResourceClass.fetchWorkspaceGlobalSpace(auth);
      const createResult = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });
      if (createResult.isErr()) {
        logger.error(
          { error: createResult.error.message },
          "Failed to create global MCP view"
        );
      } else {
        logger.info({ sId: globalMCPServer.sId }, "Global MCP tool created");
      }
    } else {
      logger.error("Failed to get system view for global MCP server");
    }
  }

  // Create restricted MCP tool (only available in restricted space)
  if (existingRestrictedMCP) {
    logger.info(
      { sId: existingRestrictedMCP.sId },
      "Restricted MCP tool already exists, skipping"
    );
  } else if (execute && restrictedSpace) {
    logger.info({ name: RESTRICTED_MCP_NAME }, "Creating restricted MCP tool");

    // Create the remote MCP server using factory
    const restrictedMCPServer = await RemoteMCPServerFactory.create(
      renderLightWorkspaceType({ workspace }),
      {
        name: RESTRICTED_MCP_NAME,
        url: `${FAKE_MCP_URL}/restricted`,
        description: "A fake MCP tool only available in the restricted space",
        tools: [
          {
            name: "restricted_action",
            description: "A fake restricted action for testing",
            inputSchema: undefined,
          },
        ],
      }
    );

    // Get the system view that was automatically created
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        restrictedMCPServer.sId
      );

    if (systemView) {
      // Create a view only in the restricted space
      const createResult = await MCPServerViewResource.create(auth, {
        systemView,
        space: restrictedSpace,
      });
      if (createResult.isErr()) {
        logger.error(
          { error: createResult.error.message },
          "Failed to create restricted MCP view"
        );
      } else {
        logger.info(
          { sId: restrictedMCPServer.sId },
          "Restricted MCP tool created"
        );
      }
    } else {
      logger.error("Failed to get system view for restricted MCP server");
    }
  }
}
