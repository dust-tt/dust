import type {
  CallToolResult,
  EmbeddedResource,
} from "@modelcontextprotocol/sdk/types.js";

import { isExecuteTablesQueryErrorResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
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
  toolName: string,
  toolCallback: (params: T) => Promise<CallToolResult>
) {
  return async (params: T) => {
    const owner = auth.getNonNullableWorkspace();

    const loggerArgs = {
      workspace: {
        sId: owner.sId,
        plan_code: auth.plan()?.code || null,
      },
      toolName,
    };

    logger.info(loggerArgs, "Tool execution start");

    const tags = [
      `tool:${toolName}`,
      `workspace:${owner.sId}`,
      `workspace_plan_code:${auth.plan()?.code || null}`,
    ];

    statsDClient.increment("use_tools.count", 1, tags);
    const startTime = performance.now();

    const result = await toolCallback(params);

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
    statsDClient.distribution(
      "run_action.duration.distribution",
      elapsed,
      tags
    );

    return result;
  };
}
