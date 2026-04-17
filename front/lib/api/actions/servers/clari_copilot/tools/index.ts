import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  CLARI_CALL_DETAILS_MIME_TYPE,
  CLARI_CALL_LIST_MIME_TYPE,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  ClariCallNotFoundError,
  getClariClient,
} from "@app/lib/api/actions/servers/clari_copilot/client";
import { CLARI_COPILOT_TOOLS_METADATA } from "@app/lib/api/actions/servers/clari_copilot/metadata";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof CLARI_COPILOT_TOOLS_METADATA> = {
  search_calls: async (params, extra) => {
    const clientResult = getClariClient(extra);
    if (clientResult.isErr()) {
      return new Err(clientResult.error);
    }

    const result = await clientResult.value.searchCalls(params);
    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to search calls: ${result.error.message}`)
      );
    }

    const calls = result.value;
    return new Ok([
      {
        type: "resource" as const,
        resource: {
          mimeType: CLARI_CALL_LIST_MIME_TYPE,
          uri: "",
          text: `${calls.length} call(s) found`,
          calls,
        },
      },
    ]);
  },

  get_call_details: async ({ call_id }, extra) => {
    const clientResult = getClariClient(extra);
    if (clientResult.isErr()) {
      return new Err(clientResult.error);
    }

    const result = await clientResult.value.getCallDetails(call_id);
    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to fetch call details: ${result.error.message}`, {
          tracked: !(result.error instanceof ClariCallNotFoundError),
        })
      );
    }

    const call = result.value;
    return new Ok([
      {
        type: "resource" as const,
        resource: {
          mimeType: CLARI_CALL_DETAILS_MIME_TYPE,
          uri: call.call_review_page_url ?? "",
          text: `Call details retrieved for "${call.title ?? call.id}"`,
          call,
        },
      },
    ]);
  },
};

export const TOOLS = buildTools(CLARI_COPILOT_TOOLS_METADATA, handlers);
