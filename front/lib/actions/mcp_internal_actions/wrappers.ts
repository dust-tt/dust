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
import { errorToString, type Result } from "@app/types";

/**
 * Wraps a tool callback with logging and monitoring.
 * The tool callback is expected to return a `Result<CallToolResult["content"], MCPError>`,
 * Errors are caught and logged unless not tracked, and the error is returned as a text content.
 */
export function withToolLogging<T>(
  auth: Authenticator,
  {
    toolName,
    agentLoopContext,
  }: {
    toolName: string;
    agentLoopContext?: AgentLoopContextType;
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
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        plan_code: auth.plan()?.code || null,
      },
      toolName,
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
      `tool:${toolName}`,
      `workspace:${owner.sId}`,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      `workspace_plan_code:${auth.plan()?.code || null}`,
    ];

    statsDClient.increment("use_tools.count", 1, tags);
    const startTime = performance.now();

    const result = await toolCallback(params, extra);

    // When we get an Err, we monitor it if tracked and return it as a text content.
    if (result.isErr()) {
      if (result.error.tracked) {
        statsDClient.increment("use_tools_error.count", 1, [
          "error_type:run_error",
          ...tags,
        ]);

        logger.error(
          {
            error: result.error.message,
            ...loggerArgs,
          },
          "Tool execution error"
        );
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
    statsDClient.distribution("run_tool.duration.distribution", elapsed, tags);

    return { isError: false, content: result.value };
  };
}
