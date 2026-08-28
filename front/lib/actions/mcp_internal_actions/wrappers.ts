import type {
  RegistrableToolDefinition,
  ToolHandlerResultWithStructuredContent,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { normalizeToolHandlerOutput } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContext, ToolRunContext } from "@app/lib/actions/types";
import {
  isAgentLoopRunContext,
  isSandboxFunctionRunContext,
} from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { Ok } from "@app/types/shared/result";
import { errorToString } from "@app/types/shared/utils/error_utils";
import { truncate } from "@app/types/shared/utils/string_utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

const MAX_LOGGED_ERROR_MESSAGE_LENGTH = 200;

export function registerTool(
  auth: Authenticator,
  toolContext: ToolContext | undefined,
  server: McpServer,
  tool: RegistrableToolDefinition,
  { monitoringName }: { monitoringName: string }
): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      _meta: {
        dust: {
          stake: tool.stake,
          displayLabels: tool.displayLabels,
          eager: tool.eager,
          editableArguments: tool.editableArguments,
        },
      },
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: monitoringName,
        runContext: toolContext?.runContext,
        enableAlerting: tool.enableAlerting,
      },
      (params, extra) => {
        // Handlers registered during the listing phase are never invoked: tools only execute on
        // a connection established with a run context.
        const runContext = toolContext?.runContext;
        assert(runContext, "Tool handlers require a tool run context.");
        return withToolResultProcessing(
          tool.handler(params, { ...extra, runContext, auth })
        );
      }
    )
  );
}

// The MCP SDK is now stripping extra properties from the tool result (both client and server).
// To keep the same behavior as before, we move the extra properties to the _meta field of each resource item.
// They will be moved back to the resource items root level in the tool result processing.
export async function withToolResultProcessing(
  resultPromise: Promise<ToolHandlerResultWithStructuredContent>
): Promise<ToolHandlerResultWithStructuredContent> {
  const result = await resultPromise;
  if (result.isOk()) {
    const { content, structuredContent } = normalizeToolHandlerOutput(
      result.value
    );
    const processedContent = content.map((item) => {
      if (item.type === "resource") {
        // Pickup extra properties compared to the offical SDK speccs at the root level.
        const officalSDKFields = ["text", "uri", "mimeType", "blob", "_meta"];
        const extraProperties = Object.fromEntries(
          Object.entries(item.resource).filter(
            ([k, v]) => !officalSDKFields.includes(k) && v !== undefined
          )
        );

        return {
          ...item,
          resource: {
            ...item.resource,
            _meta: {
              ...item.resource._meta,
              ...extraProperties,
            },
          },
        };
      } else {
        return item;
      }
    });

    return new Ok(
      structuredContent !== undefined
        ? { content: processedContent, structuredContent }
        : processedContent
    );
  }
  return result;
}

/**
 * Wraps a tool callback with logging and monitoring.
 * The tool callback is expected to return content blocks, optionally paired with
 * `structuredContent`,
 * Errors are caught and logged unless not tracked, and the error is returned as a text content.
 *
 * The tool name is used as a tag in the DD metric, it's 1 tool name <=> 1 monitor.
 */
function withToolLogging<T>(
  auth: Authenticator,
  {
    toolNameForMonitoring,
    runContext,
    enableAlerting = false,
  }: {
    toolNameForMonitoring: string;
    // Undefined at listing-phase registration; always set when the callback actually runs.
    runContext: ToolRunContext | undefined;
    enableAlerting?: boolean;
  },
  toolCallback: (
    params: T,
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>
  ) => Promise<ToolHandlerResultWithStructuredContent>
): (
  params: T,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
) => Promise<CallToolResult> {
  return async (
    params: T,
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>
  ) => {
    const owner = auth.getNonNullableWorkspace();

    let loggerArgs: Record<
      string,
      string | number | Record<string, string | null>
    > = {
      workspace: {
        sId: owner.sId,
        plan_code: auth.plan()?.code ?? null,
      },
      toolName: toolNameForMonitoring,
    };

    // Adding run context identifiers if available.
    if (runContext) {
      if (isAgentLoopRunContext(runContext)) {
        const {
          agentConfiguration,
          toolConfiguration,
          conversation,
          agentMessage,
        } = runContext;
        loggerArgs = {
          ...loggerArgs,
          actionConfigurationId: toolConfiguration.sId,
          agentConfigurationId: agentConfiguration.sId,
          agentConfigurationVersion: agentConfiguration.version,
          agentMessageId: agentMessage.sId,
          conversationId: conversation.sId,
        };
      } else if (isSandboxFunctionRunContext(runContext)) {
        const { invocation, toolConfiguration } = runContext;
        loggerArgs = {
          ...loggerArgs,
          actionConfigurationId: toolConfiguration.sId,
          sandboxFunctionId: invocation.sandboxFunction.sId,
          invocationId: invocation.sId,
        };
      }
    }

    logger.info(loggerArgs, "Tool execution start");

    const tags = [`tool:${toolNameForMonitoring}`];

    if (enableAlerting) {
      statsDMetrics.increment("use_tools.count", 1, tags);
    }
    const startTime = performance.now();

    const result = await toolCallback(params, extra);

    const elapsed = performance.now() - startTime;

    // When we get an Err, we monitor it if tracked and return it as a text content.
    if (result.isErr()) {
      if (enableAlerting && result.error.tracked) {
        statsDMetrics.increment("use_tools_error.count", 1, [
          "error_type:run_error",
          ...tags,
        ]);
      }

      const logContext = {
        ...loggerArgs,
        duration: elapsed,
        error: {
          message: truncate(
            result.error.message,
            MAX_LOGGED_ERROR_MESSAGE_LENGTH
          ),
          code: result.error.code,
          cause: result.error.cause
            ? errorToString(result.error.cause)
            : undefined,
        },
      };
      if (result.error.tracked) {
        logger.error(logContext, "Tool execution error");
      } else {
        logger.warn(logContext, "Tool execution error");
      }

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: errorToString(result.error),
          },
        ],
      };
    }

    if (enableAlerting) {
      statsDMetrics.distribution(
        "run_tool.duration.distribution",
        elapsed,
        tags
      );
    }

    logger.info(
      {
        ...loggerArgs,
        duration: elapsed,
      },
      "Tool execution success"
    );

    const { content, structuredContent } = normalizeToolHandlerOutput(
      result.value
    );

    return {
      isError: false,
      content,
      ...(structuredContent !== undefined ? { structuredContent } : {}),
    };
  };
}
