import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

import type { MCPError } from "@app/lib/actions/mcp_errors";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type { Result } from "@app/types";
import { errorToString } from "@app/types";

/**
 * Wraps a tool callback with logging and monitoring.
 * The tool callback is expected to return a `Result<CallToolResult["content"], MCPError>`,
 * Errors are caught and logged unless not tracked, and the error is returned as a text content.
 *
 * The tool name is used as a tag in the DD metric, it's 1 tool name <=> 1 monitor.
 */
export function withToolLogging<T>(
  auth: Authenticator,
  {
    toolNameForMonitoring,
    agentLoopContext,
    enableAlerting = false,
  }: {
    toolNameForMonitoring: string;
    agentLoopContext: AgentLoopContextType | undefined;
    enableAlerting?: boolean;
  },
  toolCallback: (
    params: T,
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>
  ) => Promise<Result<CallToolResult["content"], MCPError>>
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

    // Adding agent loop context if available.
    if (agentLoopContext?.runContext) {
      const {
        agentConfiguration,
        toolConfiguration,
        conversation,
        agentMessage,
      } = agentLoopContext.runContext;
      loggerArgs = {
        ...loggerArgs,
        actionConfigurationId: toolConfiguration.sId,
        agentConfigurationId: agentConfiguration.sId,
        agentConfigurationVersion: agentConfiguration.version,
        agentMessageId: agentMessage.sId,
        conversationId: conversation.sId,
      };
    }

    logger.info(loggerArgs, "Tool execution start");

    const tags = [
      `tool:${toolNameForMonitoring}`,
      `workspace:${owner.sId}`,
      `workspace_plan_code:${auth.plan()?.code ?? null}`,
    ];

    if (enableAlerting) {
      statsDClient.increment("use_tools.count", 1, tags);
    }
    const startTime = performance.now();

    const result = await toolCallback(params, extra);

    // When we get an Err, we monitor it if tracked and return it as a text content.
    if (result.isErr()) {
      if (enableAlerting && result.error.tracked) {
        statsDClient.increment("use_tools_error.count", 1, [
          "error_type:run_error",
          ...tags,
        ]);
      }

      const logContext = { ...loggerArgs, error: result.error };
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

    const elapsed = performance.now() - startTime;
    if (enableAlerting) {
      statsDClient.distribution(
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

    return { isError: false, content: result.value };
  };
}
