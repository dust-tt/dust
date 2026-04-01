import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  GongApiError,
  getGongClient,
} from "@app/lib/api/actions/servers/gong/client";
import { GONG_TOOLS_METADATA } from "@app/lib/api/actions/servers/gong/metadata";
import {
  renderCall,
  renderCalls,
  renderTranscripts,
} from "@app/lib/api/actions/servers/gong/rendering";
import { Err, Ok } from "@app/types/shared/result";

const MAX_CALLS_PER_REQUEST = 50;

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

    const limitedCalls = calls.slice(0, MAX_CALLS_PER_REQUEST);

    let response = `Found ${totalRecords ?? calls.length} call(s)${calls.length > MAX_CALLS_PER_REQUEST ? ` (showing first ${MAX_CALLS_PER_REQUEST})` : ""}:\n\n${renderCalls(limitedCalls)}`;

    if (nextCursor) {
      response += `\n\n---\n\nMore calls available. Use cursor "${nextCursor}" to fetch the next page.`;
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

    const [transcriptResult, callResult] = await Promise.all([
      client.getCallTranscripts([callId]),
      client.getCallsExtensive([callId]),
    ]);

    if (transcriptResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to get call transcript: ${transcriptResult.error.message}`,
          {
            tracked: isTrackedError(transcriptResult.error),
          }
        )
      );
    }

    const transcripts = transcriptResult.value;

    if (transcripts.length === 0) {
      return new Err(
        new MCPError(
          `No transcript found for call with ID "${callId}". The call may not have been transcribed yet.`,
          { tracked: false }
        )
      );
    }

    // Build speakerId → name map from call parties.
    const speakerNames: Record<string, string> = {};
    if (callResult.isOk()) {
      const call = callResult.value[0];
      if (call?.parties) {
        for (const party of call.parties) {
          if (party.speakerId && party.name) {
            speakerNames[party.speakerId] = party.name;
          }
        }
      }
    }

    return new Ok([
      {
        type: "text" as const,
        text: renderTranscripts(transcripts, speakerNames),
      },
    ]);
  },
};

export const TOOLS = buildTools(GONG_TOOLS_METADATA, handlers);
