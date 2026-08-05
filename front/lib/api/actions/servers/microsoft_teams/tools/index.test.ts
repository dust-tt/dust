import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TOOLS } from ".";

function getTranscriptContentTool() {
  const tool = TOOLS.find(({ name }) => name === "get_transcript_content");
  if (!tool) {
    throw new Error("get_transcript_content tool not found");
  }
  return tool;
}

function createTestExtra(): Omit<ToolHandlerExtra, "auth" | "runContext"> {
  return {
    authInfo: {
      token: "microsoft-token",
      clientId: "microsoft-client",
      scopes: [],
    },
    requestId: "microsoft-teams-transcript-test",
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request");
    },
    signal: new AbortController().signal,
  };
}

describe("Microsoft Teams transcript tool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces the Microsoft Graph error message when transcript retrieval fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [{ id: "meeting-id" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: [
              {
                id: "transcript-id",
                createdDateTime: "2026-08-05T10:00:00Z",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "Forbidden",
              message: "Transcript access is disabled by the tenant admin.",
              innerError: {
                code: "GraphAccessToTranscriptsDisabled",
              },
            },
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTranscriptContentTool();
    const result = await tool.handler(
      { joinUrl: "https://teams.microsoft.com/l/meetup-join/test" },
      // @ts-expect-error This handler only reads authInfo from the tool context.
      createTestExtra()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "Transcript access is disabled by the tenant admin."
      );
    }
  });
});
