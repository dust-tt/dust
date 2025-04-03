import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type {
  MCPServerConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Redeclared here to avoid an issue with the zod types in the @modelcontextprotocol/sdk
// See https://github.com/colinhacks/zod/issues/2938
const ResourceContentsSchema = z.object({
  uri: z.string(),
  mimeType: z.optional(z.string()),
});

const TextResourceContentsSchema = ResourceContentsSchema.extend({
  text: z.string(),
});

const BlobResourceContentsSchema = ResourceContentsSchema.extend({
  blob: z.string().base64(),
});

const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string().base64(),
  mimeType: z.string(),
});

const EmbeddedResourceSchema = z.object({
  type: z.literal("resource"),
  resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
});

const Schema = z.union([
  TextContentSchema,
  ImageContentSchema,
  EmbeddedResourceSchema,
]);

export type ToolType = ListToolsResult["tools"][number];

export type MCPToolResultContent = z.infer<typeof Schema>;

function makeMCPConfigurations({
  config,
  listToolsResult,
}: {
  config: MCPServerConfigurationType;
  listToolsResult: ToolType[];
}): MCPToolConfigurationType[] {
  return listToolsResult.map((tool) => {
    return {
      id: config.id,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      mcpServerViewId: config.mcpServerViewId,
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema,
      dataSources: config.dataSources,
    };
  });
}

/**
 * Try to call an MCP tool.
 *
 * This function will potentially fail if the server is remote as it will try to connect to it.
 */
export async function tryCallMCPTool(
  auth: Authenticator,
  {
    owner,
    actionConfiguration,
    rawInputs,
  }: {
    owner: LightWorkspaceType;
    actionConfiguration: MCPToolConfigurationType;
    rawInputs: Record<string, unknown> | undefined;
  }
): Promise<Result<MCPToolResultContent[], Error>> {
  try {
    const res = await MCPServerViewResource.fetchById(
      auth,
      actionConfiguration.mcpServerViewId
    );
    if (res.isErr()) {
      throw new Error(
        `MCP server view with id ${actionConfiguration.mcpServerViewId} not found.`
      );
    }
    const mcpServerView = res.value;

    const mcpClient = await connectToMCPServer(auth, {
      type: "mcpServerId",
      mcpServerId: mcpServerView.mcpServerId,
    });
    const r = await mcpClient.callTool({
      name: actionConfiguration.name,
      arguments: rawInputs,
    });

    await mcpClient.close();

    if (r.isError) {
      return new Err(new Error(r.content as string));
    }

    // Type inference is not working here because of them using passthrough in the zod schema.
    const content: MCPToolResultContent[] = (r.content ??
      []) as MCPToolResultContent[];

    return new Ok(content);
  } catch (error) {
    logger.error(
      {
        workspaceId: owner.id,
        actionConfiguration,
        error,
      },
      `Error calling MCP tool, returning error.`
    );
    return new Err(normalizeError(error));
  }
}

/**
 * Get the MCP tools for the given agent actions.
 *
 * This function will return the MCP tools for the given agent actions by connecting to the MCP server(s).
 */
export async function tryGetMCPTools(
  auth: Authenticator,
  {
    agentActions,
  }: {
    agentActions: AgentActionConfigurationType[];
  }
): Promise<MCPToolConfigurationType[]> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("mcp_actions")) {
    return [];
  }
  // Discover all the tools exposed by all the mcp server available.
  const configurations = await Promise.all(
    agentActions.filter(isMCPServerConfiguration).map(async (action) => {
      try {
        const res = await MCPServerViewResource.fetchById(
          auth,
          action.mcpServerViewId
        );
        if (res.isErr()) {
          throw new Error(
            `MCP server view with id ${action.mcpServerViewId} not found.`
          );
        }
        const mcpServerView = res.value;
        const r: ToolType[] = await listMCPServerTools(
          auth,
          mcpServerView.mcpServerId
        );

        return makeMCPConfigurations({
          config: action,
          listToolsResult: r,
        });
      } catch (error) {
        logger.error(
          {
            workspaceId: owner.id,
            action,
            error,
          },
          `Error listing tools for MCP server, returning empty list.`
        );
        return [];
      }
    })
  );

  return configurations.flat();
}

export async function listMCPServerTools(
  auth: Authenticator,
  mcpServerId: string
): Promise<ToolType[]> {
  const mcpClient = await connectToMCPServer(auth, {
    type: "mcpServerId",
    mcpServerId,
  });

  let allTools: ToolType[] = [];
  let nextPageCursor;
  do {
    const { tools, nextCursor } = await mcpClient.listTools();
    nextPageCursor = nextCursor;
    allTools = [...allTools, ...tools];
  } while (nextPageCursor);

  await mcpClient.close();

  return allTools;
}
