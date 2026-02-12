import { MCPError } from "@app/lib/actions/mcp_errors";
import { matchesInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ToolGeneratedFileType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolDefinition } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfigurationWithName,
} from "@app/lib/actions/types/guards";
import {
  containsFileOutput,
  convertDatasetSchemaToZodRawShape,
  prepareAppContext,
  prepareParamsWithHistory,
  processDustFileOutput,
} from "@app/lib/api/actions/servers/run_dust_app/helpers";
import { RUN_DUST_APP_TOOL_NAME } from "@app/lib/api/actions/servers/run_dust_app/metadata";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { sanitizeJSONOutput } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { getHeaderFromGroupIds, getHeaderFromRole } from "@app/types/groups";
import { Err, Ok } from "@app/types/shared/result";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";

/**
 * Creates the run_dust_app MCP server.
 *
 * This server is special because tools are dynamically created based on the Dust app
 * configuration. The server handles three different contexts:
 *
 * 1. listToolsContext: Used to list available tools for an agent. Creates a tool
 *    based on the configured Dust app's input schema.
 *
 * 2. runContext: Used when actually running the Dust app. Creates a tool that
 *    executes the app with the provided parameters.
 *
 * 3. Default context: Used during configuration to select which Dust app to use.
 *    Creates a configuration tool using the DUST_APP input schema.
 */
export default async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("run_dust_app");
  const owner = auth.getNonNullableWorkspace();

  if (agentLoopContext?.listToolsContext) {
    // Context: Listing tools for an agent
    const { agentActionConfiguration } = agentLoopContext.listToolsContext;
    if (
      !isServerSideMCPServerConfigurationWithName(
        agentActionConfiguration,
        "run_dust_app"
      )
    ) {
      throw new Error("Invalid Dust app run agent configuration");
    }

    const { app, schema } = await prepareAppContext(
      auth,
      agentActionConfiguration
    );

    if (!app.description) {
      throw new Error("Missing app description");
    }

    const toolDefinition: ToolDefinition = {
      name: app.name,
      description: app.description,
      schema: convertDatasetSchemaToZodRawShape(schema),
      stake: "never_ask",
      displayLabels: {
        running: "Listing Dust App configuration",
        done: "List Dust App configuration",
      },
      // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
      handler: async () => {
        return new Ok([
          {
            type: "text",
            text: "Successfully list Dust App configuration",
          },
        ]);
      },
    };

    registerTool(auth, agentLoopContext, server, toolDefinition, {
      monitoringName: RUN_DUST_APP_TOOL_NAME,
    });
  } else if (agentLoopContext?.runContext) {
    // Context: Running the Dust app
    const { toolConfiguration } = agentLoopContext.runContext;
    if (
      !isLightServerSideMCPToolConfiguration(toolConfiguration) ||
      !matchesInternalMCPServerName(
        toolConfiguration.internalMCPServerId,
        "run_dust_app"
      )
    ) {
      throw new Error("Invalid Dust app run tool configuration");
    }

    const { app, schema, appConfig } = await prepareAppContext(
      auth,
      toolConfiguration
    );

    if (!app.description) {
      throw new Error("Missing app description");
    }

    const toolDefinition: ToolDefinition = {
      name: app.name,
      description: app.description,
      schema: convertDatasetSchemaToZodRawShape(schema),
      stake: "never_ask",
      displayLabels: {
        running: "Running Dust app",
        done: "Run Dust app",
      },
      handler: async (params) => {
        const content: (
          | TextContent
          | { type: "resource"; resource: ToolGeneratedFileType }
        )[] = [];

        const preparedParams = await prepareParamsWithHistory(
          params,
          schema,
          agentLoopContext.runContext,
          auth
        );

        const requestedGroupIds = auth.groupIds();

        const prodCredentials = await prodAPICredentialsForOwner(owner);
        const apiConfig = config.getDustAPIConfig();
        const api = new DustAPI(
          apiConfig,
          {
            ...prodCredentials,
            extraHeaders: {
              ...getHeaderFromGroupIds(requestedGroupIds),
              ...getHeaderFromRole(auth.role()), // Keep the user's role for api.runApp call only
            },
          },
          logger,
          apiConfig.nodeEnv === "development" ? "http://localhost:3000" : null
        );

        const runRes = await api.runAppStreamed(
          {
            workspaceId: owner.sId,
            appId: app.sId,
            appSpaceId: app.space.sId,
            appHash: "latest",
          },
          appConfig,
          [preparedParams],
          { useWorkspaceCredentials: true }
        );

        if (runRes.isErr()) {
          return new Err(
            new MCPError(`Error running Dust app: ${runRes.error.message}`)
          );
        }

        const { eventStream } = runRes.value;
        let lastBlockOutput = null;

        for await (const event of eventStream) {
          if (event.type === "error") {
            return new Err(
              new MCPError(`Error running Dust app: ${event.content.message}`)
            );
          }

          if (event.type === "block_execution") {
            const e = event.content.execution[0][0];
            if (e.error) {
              return new Err(
                new MCPError(`Error in block execution: ${e.error}`)
              );
            }
            lastBlockOutput = e.value;
          }
        }

        const sanitizedOutput = sanitizeJSONOutput(lastBlockOutput);

        if (
          containsFileOutput(sanitizedOutput) &&
          agentLoopContext.runContext?.conversation
        ) {
          const fileContent = await processDustFileOutput(
            auth,
            sanitizedOutput,
            agentLoopContext.runContext.conversation,
            app.name
          );
          content.push(...fileContent);
        }

        content.push({
          type: "text",
          text: JSON.stringify(sanitizedOutput, null, 2),
        });

        return new Ok(content);
      },
    };

    registerTool(auth, agentLoopContext, server, toolDefinition, {
      monitoringName: RUN_DUST_APP_TOOL_NAME,
    });
  } else {
    // Context: Configuration - selecting which Dust app to use

    const toolDefinition: ToolDefinition = {
      name: "run_dust_app",
      description: "Run a Dust App with specified parameters.",
      schema: {
        dustApp:
          ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP],
      },
      stake: "never_ask",
      displayLabels: {
        running: "Running Dust app",
        done: "Run Dust app",
      },
      // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
      handler: async () => {
        return new Ok([
          {
            type: "text",
            text: "Successfully saved Dust App configuration",
          },
        ]);
      },
    };

    registerTool(auth, agentLoopContext, server, toolDefinition, {
      monitoringName: RUN_DUST_APP_TOOL_NAME,
    });
  }

  return server;
}
