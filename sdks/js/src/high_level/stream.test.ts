import { describe, expect, it, vi } from "vitest";

import { DustServerError } from "../errors/errors";
import type { DustAPI } from "../index";
import { MessageStreamImpl } from "./stream";

function makeClient(): DustAPI {
  const events = [
    {
      type: "mcp_approve_execution",
      messageId: "am1",
      actionId: "act1",
      toolName: "search",
      serverName: "server",
      description: "run a search",
      input: {},
    },
  ];

  return {
    _logger: { error: vi.fn(), info: vi.fn(), trace: vi.fn(), warn: vi.fn() },
    createConversation: vi.fn().mockResolvedValue({
      isErr: () => false,
      value: {
        conversation: {
          sId: "conv1",
          content: [
            [{ type: "agent_message", sId: "am1", parentMessageId: "um1" }],
          ],
        },
        message: { sId: "um1" },
      },
    }),
    streamAgentAnswerEvents: vi.fn().mockResolvedValue({
      isErr: () => false,
      value: {
        eventStream: (async function* () {
          yield* events;
        })(),
      },
    }),
    validateAction: vi.fn().mockResolvedValue({
      isErr: () => true,
      error: { type: "internal_server_error", message: "validate failed" },
    }),
  } as unknown as DustAPI;
}

describe("MessageStreamImpl tool approval", () => {
  it("surfaces an error when the approval request fails", async () => {
    const client = makeClient();
    const stream = new MessageStreamImpl(
      client,
      { agentId: "agent", message: "hello" },
      true
    );

    await expect(stream.finalMessage()).rejects.toBeInstanceOf(DustServerError);
    expect(client.validateAction).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error when the rejection request fails", async () => {
    const client = makeClient();
    const stream = new MessageStreamImpl(
      client,
      { agentId: "agent", message: "hello" },
      false
    );

    await expect(stream.finalMessage()).rejects.toBeInstanceOf(DustServerError);
    expect(client.validateAction).toHaveBeenCalledTimes(1);
  });
});
