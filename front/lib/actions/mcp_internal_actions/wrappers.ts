import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type { Result } from "@app/types";

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
  ) => Promise<Result<CallToolResult, Error>>
) {
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
        plan_code: auth.plan()?.code || null,
      },
      toolName,
    };

    // Adding agent loop context if available.
    if (agentLoopContext?.runContext) {
      const {
        agentConfiguration,
        actionConfiguration,
        conversation,
        agentMessage,
      } = agentLoopContext.runContext;
      loggerArgs = {
        ...loggerArgs,
        actionConfigurationId: actionConfiguration.sId,
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
      `workspace_plan_code:${auth.plan()?.code || null}`,
    ];

    statsDClient.increment("use_tools.count", 1, tags);
    const startTime = performance.now();

    const result = await toolCallback(params, extra);

    // When we get an Err, we monitor it and return it as a text content.
    if (result.isErr()) {
      statsDClient.increment("use_tools_error.count", 1, [
        "error_type:run_error",
        ...tags,
      ]);

      const error = result.error.message;
      logger.error(
        {
          error,
          ...loggerArgs,
        },
        "Tool execution error"
      );
      return { isError: true, content: [{ type: "text", value: result }] };
    }

    const elapsed = performance.now() - startTime;
    statsDClient.distribution("run_tool.duration.distribution", elapsed, tags);

    return result.value;
  };
}
