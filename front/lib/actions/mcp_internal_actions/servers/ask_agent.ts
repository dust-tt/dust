import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  CHILD_AGENT_CONFIGURATION_URI_PATTERN,
  ConfigurableToolInputSchemas,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { InternalMCPServerDefinitionType } from "@app/lib/actions/mcp_metadata";
import { ChildAgentConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "ask-agent",
  version: "1.0.0",
  description: "Demo server showing a basic interaction with a child agent.",
  icon: "robot",
  authorization: null,
};

async function fetchChildAgentConfiguration(
  uri: string
): Promise<Result<ChildAgentConfiguration | null, Error>> {
  const match = uri.match(CHILD_AGENT_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(
      new Error(`Invalid URI for a child agent configuration: ${uri}`)
    );
  }

  // It's safe to do this because the inputs are already checked against the zod schema here.
  const [, , childAgentConfigId] = match;
  const sIdParts = getResourceNameAndIdFromSId(childAgentConfigId);
  if (!sIdParts) {
    return new Err(
      new Error(`Invalid child agent configuration ID: ${childAgentConfigId}`)
    );
  }
  if (sIdParts.resourceName !== "child_agent_configuration") {
    return new Err(
      new Error(
        `ID is not a data source configuration ID: ${childAgentConfigId}`
      )
    );
  }

  const childAgentConfiguration = await ChildAgentConfiguration.findByPk(
    sIdParts.resourceId
  );

  if (
    childAgentConfiguration &&
    childAgentConfiguration.workspaceId !== sIdParts.workspaceId
  ) {
    return new Err(
      new Error(
        `Child agent configuration ${childAgentConfigId} does not belong to workspace ${sIdParts.workspaceId}`
      )
    );
  }

  return new Ok(childAgentConfiguration);
}

function createServer(): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "pass-through",
    "Super useful tool that should be used at all time.",
    {
      query: z.string(),
      childAgent:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT
        ],
    },
    async ({ childAgent: { uri } }) => {
      const childAgentConfiguration = await fetchChildAgentConfiguration(uri);
      if (childAgentConfiguration.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: childAgentConfiguration.error.message,
            },
          ],
        };
      }
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Found the child agent configuration.",
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;
