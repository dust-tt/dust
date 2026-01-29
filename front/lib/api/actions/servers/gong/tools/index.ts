import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getGongClient,
  GongApiError,
} from "@app/lib/api/actions/servers/gong/client";
import { GONG_TOOLS_METADATA } from "@app/lib/api/actions/servers/gong/metadata";
import {
  renderCall,
  renderCalls,
  renderTranscripts,
} from "@app/lib/api/actions/servers/gong/rendering";
import { Err, Ok } from "@app/types";

// Hard limit on the number of calls returned per request to prevent unbounded results.
const MAX_CALLS_PER_REQUEST = 100;

function isTrackedError(error: Error): boolean {
  return !(error instanceof GongApiError && error.isInvalidInput);
}

const handlers: ToolHandlers<typeof GONG_TOOLS_METADATA> = {
  list_calls: async ({ fromDateTime, toDateTime, cursor }, { authInfo }) => {
    const clientResult = getGongClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.listCalls({
      fromDateTime,
      toDateTime,
      cursor,
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to list calls: ${result.error.message}`, {
          tracked: isTrackedError(result.error),
        })
      );
    }

    const { calls, cursor: nextCursor, totalRecords } = result.value;

    if (calls.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No calls found for the specified date range.",
        },
      ]);
    }

    // Apply hard limit to prevent unbounded results.
    const limitedCalls = calls.slice(0, MAX_CALLS_PER_REQUEST);
    const wasLimited = calls.length > MAX_CALLS_PER_REQUEST;

    let response = `Found ${totalRecords ?? calls.length} call(s):\n\n${renderCalls(limitedCalls)}`;

    if (wasLimited) {
      response += `\n\n---\n\n**Note:** Results limited to ${MAX_CALLS_PER_REQUEST} calls. Use a narrower date range or cursor to see more.`;
    } else if (nextCursor) {
      response += `\n\n---\n\n**Note:** More calls available. Use cursor "${nextCursor}" to fetch the next page.`;
    }

    return new Ok([
      {
        type: "text" as const,
        text: response,
      },
    ]);
  },

  get_call: async ({ callId }, { authInfo }) => {
    const clientResult = getGongClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.getCallsExtensive([callId]);

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to get call: ${result.error.message}`, {
          tracked: isTrackedError(result.error),
        })
      );
    }

    const calls = result.value;

    if (calls.length === 0) {
      return new Err(
        new MCPError(`Call with ID "${callId}" not found.`, {
          tracked: false,
        })
      );
    }

    const call = calls[0];

    return new Ok([
      {
        type: "text" as const,
        text: renderCall(call, true),
      },
    ]);
  },

  get_call_transcript: async ({ callId }, { authInfo }) => {
    const clientResult = getGongClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.getCallTranscripts([callId]);

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to get call transcript: ${result.error.message}`, {
          tracked: isTrackedError(result.error),
        })
      );
    }

    const transcripts = result.value;

    if (transcripts.length === 0) {
      return new Err(
        new MCPError(
          `No transcript found for call with ID "${callId}". The call may not have been transcribed yet.`,
          { tracked: false }
        )
      );
    }

    return new Ok([
      {
        type: "text" as const,
        text: renderTranscripts(transcripts),
      },
    ]);
  },
};

export const TOOLS = buildTools(GONG_TOOLS_METADATA, handlers);
