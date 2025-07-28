import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  EmbeddedResource,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

import { isExecuteTablesQueryErrorResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { removeNulls } from "@app/types";

function isKnownErrorResource(
  outputBlock: CallToolResult["content"][number]
): outputBlock is {
  type: "resource";
  resource: { text: "string" } & EmbeddedResource["resource"];
} {
  return isExecuteTablesQueryErrorResourceType(outputBlock);
}

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
  ) => Promise<CallToolResult>
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

    if (result.isError) {
      statsDClient.increment("use_tools_error.count", 1, [
        "error_type:run_error",
        ...tags,
      ]);

      // Only process text content and known error resources, other resources may be huge.
      const error = removeNulls(
        result.content.map((c) =>
          c.type === "text"
            ? c.text
            : isKnownErrorResource(c)
              ? c.resource.text
              : null
        )
      ).join("\n");

      logger.error(
        {
          error,
          ...loggerArgs,
        },
        "Tool execution error"
      );
      return result;
    }

    const elapsed = performance.now() - startTime;
    statsDClient.distribution("run_tool.duration.distribution", elapsed, tags);

    return result;
  };
}
