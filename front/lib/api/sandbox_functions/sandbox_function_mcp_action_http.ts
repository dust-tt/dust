import type { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionMCPActionType } from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type SandboxFunctionMCPActionHttpResponse =
  | {
      status: "pending";
      actionId: string;
    }
  | {
      status: "rejected";
    }
  | {
      status: "success";
      action: SandboxFunctionMCPActionType & {
        output: CallToolResult["content"] | null;
        structuredContent?: CallToolResult["structuredContent"];
      };
    };

/**
 * Maps a sandbox-function MCP action to the wire contract used by
 * `GET .../actions/:aId` (poll).
 */
export async function toSandboxFunctionMCPActionHttpResponse(
  action: SandboxFunctionMCPActionResource
): Promise<Result<SandboxFunctionMCPActionHttpResponse, Error>> {
  switch (action.status) {
    case "running":
    case "blocked_authentication_required":
    case "blocked_validation_required":
      return new Ok({ status: "pending", actionId: action.sId });
    case "succeeded":
    case "errored": {
      const outputResult = await action.readOutput();
      if (outputResult.isErr()) {
        return new Err(new Error("Failed to read the action output."));
      }
      const output = outputResult.value;
      // Succeeded while GCS write-behind is still in flight and the Redis stage
      // was missed: keep the sandbox polling rather than returning empty output.
      if (
        output === null &&
        !action.outputGcsPath &&
        action.status === "succeeded"
      ) {
        return new Ok({ status: "pending", actionId: action.sId });
      }
      return new Ok({
        status: "success",
        action: {
          ...action.toJSON(),
          output: output?.content ?? null,
          ...(output?.structuredContent !== undefined
            ? { structuredContent: output.structuredContent }
            : {}),
        },
      });
    }
    case "denied":
      return new Ok({ status: "rejected" });
    default:
      assertNever(action.status);
  }
}

export function httpStatusForSandboxFunctionMCPActionResponse(
  response: SandboxFunctionMCPActionHttpResponse
): 200 | 202 | 403 {
  switch (response.status) {
    case "pending":
      return 202;
    case "success":
      return 200;
    case "rejected":
      return 403;
  }
  // Unreachable when the union is exhaustive; fails the build if a status is added.
  return assertNever(response);
}
