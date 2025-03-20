import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  Implementation,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_NAME,
} from "@app/lib/actions/constants";
import type {
  MCPServerConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { connectToInternalMCPServer } from "@app/lib/actions/mcp_internal_actions";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

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

export type MCPToolResultContent = z.infer<typeof Schema>;

function isPropertyCompatibleType(value: unknown): value is {
  title?: string;
  description?: string;
  type: "string" | "number" | "boolean" | "array" | "object";
} {
  return (
    value != null &&
    typeof value === "object" &&
    "type" in value &&
    (value.type === "string" ||
      value.type === "number" ||
      value.type === "boolean" ||
      value.type === "array" ||
      value.type === "object")
  );
}

function isPropertyWithItemAndCompatibleItemType(value: unknown): value is {
  items: { type: "string" | "number" | "boolean" };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "items" in value &&
    typeof value.items === "object" &&
    value.items !== null &&
    "type" in value.items &&
    (value.items.type === "string" ||
      value.items.type === "number" ||
      value.items.type === "boolean")
  );
}

function makeMCPConfigurations({
  config,
  listToolsResult,
}: {
  config: MCPServerConfigurationType;
  listToolsResult: ListToolsResult;
}): MCPToolConfigurationType[] {
  return listToolsResult.tools.map((tool) => {
    return {
      id: config.id,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      serverType: config.serverType,
      internalMCPServerId: config.internalMCPServerId,
      remoteMCPServerId: config.remoteMCPServerId,
      name: tool.name,
      description: tool.description ?? null,

      inputs: Object.entries(tool.inputSchema.properties ?? {}).map(
        ([propertyName, propertyValues]) => {
          // Check if propertyValues is an object with a title and type property.
          if (isPropertyCompatibleType(propertyValues)) {
            if (propertyValues.type === "array") {
              if (isPropertyWithItemAndCompatibleItemType(propertyValues)) {
                return {
                  name: propertyName,
                  description:
                    propertyValues.title ?? propertyValues.description ?? "",
                  type: propertyValues.type,
                  items: {
                    type: propertyValues.items.type,
                  },
                };
              } else {
                return {
                  name: propertyName,
                  description:
                    propertyValues.title ?? propertyValues.description ?? "",
                  type: propertyValues.type,
                  items: {
                    type: "string", // fallback type
                  },
                };
              }
            } else {
              return {
                name: propertyName,
                description:
                  propertyValues.title ?? propertyValues.description ?? "",
                type: propertyValues.type,
              };
            }
          } else {
            throw new Error(
              `MCPConfigurationServerRunner: property ${propertyName} is not a valid property: ${JSON.stringify(
                propertyValues
              )}`
            );
          }
        }
      ),
    };
  });
}

const connectToMCPServer = async ({
  serverType,
  internalMCPServerId,
  remoteMCPServerId,
}: {
  serverType: MCPServerConfigurationType["serverType"];
  internalMCPServerId?:
    | MCPServerConfigurationType["internalMCPServerId"]
    | null;
  remoteMCPServerId?: MCPServerConfigurationType["remoteMCPServerId"] | null;
}) => {
  //TODO(mcp): handle failure, timeout...
  // This is where we route the MCP client to the right server.
  const mcpClient = new Client({
    name: "dust-mcp-client",
    version: "1.0.0",
  });

  switch (serverType) {
    case "internal":
      if (!internalMCPServerId) {
        throw new Error(
          "Internal MCP server ID is required for internal server type."
        );
      }

      // Create a pair of linked in-memory transports
      // And connect the client to the server.
      const [client, server] = InMemoryTransport.createLinkedPair();
      await connectToInternalMCPServer(internalMCPServerId, server);
      await mcpClient.connect(client);
      break;

    case "remote":
      if (!remoteMCPServerId) {
        throw new Error(
          "Remote MCP server ID is required for remote server type."
        );
      }

      const remoteMCPServer = await RemoteMCPServer.findOne({
        where: {
          sId: remoteMCPServerId,
        },
      });

      if (!remoteMCPServer) {
        throw new Error(
          `Remote MCP server with remoteMCPServerId ${remoteMCPServerId} not found for remote server type.`
        );
      }

      const sseTransport = new SSEClientTransport(new URL(remoteMCPServer.url));
      await mcpClient.connect(sseTransport);
      break;

    default:
      assertNever(serverType);
  }

  return mcpClient;
};

function extractMetadataFromServerVersion(r: Implementation | undefined): {
  name: string;
  description: string;
} {
  return {
    name: r?.name ?? DEFAULT_MCP_ACTION_NAME,
    description:
      (r && "description" in r && typeof r.description === "string"
        ? r.description
        : DEFAULT_MCP_ACTION_DESCRIPTION) ?? DEFAULT_MCP_ACTION_DESCRIPTION,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function updateRemoteMCPServerMetadata(config: {
  serverType: "remote";
  remoteMCPServerId: string;
}) {
  const remoteMCPServer = await RemoteMCPServer.findOne({
    where: {
      sId: config.remoteMCPServerId,
    },
  });

  if (!remoteMCPServer) {
    throw new Error(
      `Remote MCP server with remoteMCPServerId ${config.remoteMCPServerId} not found.`
    );
  }

  const mcpClient = await connectToMCPServer(config);
  const r = await mcpClient.getServerVersion();
  await mcpClient.close();

  const metadata = extractMetadataFromServerVersion(r);

  await remoteMCPServer.update(metadata);
}

export async function getMCPServerMetadata(
  config: AgentMCPServerConfiguration
): Promise<{
  name: string;
  description: string;
}> {
  switch (config.serverType) {
    case "internal":
      // For internal servers, we can connect to the server directly as it's an in-memory communication in the same process.
      const mcpClient = await connectToMCPServer({
        serverType: config.serverType,
        internalMCPServerId: config.internalMCPServerId,
      });

      const r = await mcpClient.getServerVersion();
      await mcpClient.close();

      return extractMetadataFromServerVersion(r);
    case "remote":
      if (!config.remoteMCPServerId) {
        throw new Error(
          `Remote MCP server ID is required for remote server type.`
        );
      }

      const remoteMCPServer = await RemoteMCPServer.findByPk(
        config.remoteMCPServerId
      );

      if (!remoteMCPServer) {
        throw new Error(
          `Remote MCP server with remoteMCPServerId ${config.sId} not found.`
        );
      }

      // TODO(mcp): add a background job to update the metadata by calling updateRemoteMCPServerMetadata.

      return {
        name: remoteMCPServer.name,
        description:
          remoteMCPServer.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
      };

    default:
      assertNever(config.serverType);
  }
}

export async function callMCPTool({
  actionConfiguration,
  rawInputs,
}: {
  actionConfiguration: MCPToolConfigurationType;
  rawInputs: Record<string, unknown> | undefined;
}): Promise<Result<MCPToolResultContent[], Error>> {
  const mcpClient = await connectToMCPServer(actionConfiguration);

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
}

export async function getMCPActions(
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
      // Connect to the MCP server.
      const mcpClient = await connectToMCPServer(action);

      const r: ListToolsResult = await mcpClient.listTools();

      // Close immediately after listing tools.
      await mcpClient.close();

      return makeMCPConfigurations({
        config: action,
        listToolsResult: r,
      });
    })
  );

  return configurations.flat();
}
