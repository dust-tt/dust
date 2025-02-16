import type {
  MCPConfigurationType,
  MCPHostConfig,
} from "@dust-tt/types/dist/front/assistant/actions/mcp";
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";

import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";

function isPropertyWithTitleAndCompatibleType(value: unknown): value is {
  title: string;
  type: "string" | "number" | "boolean" | "array";
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "title" in value &&
    typeof value.title === "string" &&
    "type" in value &&
    (value.type === "string" ||
      value.type === "number" ||
      value.type === "boolean" ||
      value.type === "array")
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

function makeMCPConfigurations(
  listToolsResult: ListToolsResult,
  hostConfig: MCPHostConfig
): MCPConfigurationType[] {
  return listToolsResult.tools.map((tool) => {
    return {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      hostConfig: hostConfig,
      name: tool.name,
      description: tool.description ?? null,
      inputs: Object.entries(tool.inputSchema.properties ?? {}).map(
        ([propertyName, propertyValues]) => {
          // Check if propertyValues is an object with a title and type property.
          if (isPropertyWithTitleAndCompatibleType(propertyValues)) {
            if (propertyValues.type === "array") {
              if (isPropertyWithItemAndCompatibleItemType(propertyValues)) {
                return {
                  name: propertyName,
                  description: propertyValues.title,
                  type: propertyValues.type,
                  items: {
                    type: propertyValues.items.type,
                  },
                };
              } else {
                return {
                  name: propertyName,
                  description: propertyValues.title,
                  type: propertyValues.type,
                  items: {
                    type: "string", // fallback type
                  },
                };
              }
            } else {
              return {
                name: propertyName,
                description: propertyValues.title,
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

export async function getMCPActions(
  auth: Authenticator
): Promise<MCPConfigurationType[]> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("mcp_client_feature")) {
    return [];
  }

  // TODO(mcp): loop over different sources for MCP actions and concatenate all the tools.

  // For now, we only support the hostType "client" via the relay.

  // Ask the MCP server running on the dust client to get the list of tools available.
  const mcpClient = new MCPClient({
    name: "dust-mcp-client",
    version: "1.0.0",
  });

  // We probably want to pass the mcpClient as an argument to the function so that we can then listen to the events if needed.
  await mcpClient.connect(
    new SSEClientTransport(new URL("http://localhost:8081/sse")) // Hardcoded relay url for now.
  );
  const r: ListToolsResult = await mcpClient.listTools();

  // Until then, we connect, then close.
  await mcpClient.close();

  return makeMCPConfigurations(r, {
    hostType: "client",
    hostUrl: null, // Do not pass the relay url as "client" type should be able to get it from env.
  });
}
