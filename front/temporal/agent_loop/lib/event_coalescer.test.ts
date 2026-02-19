import * as streamingEvents from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { globalCoalescer } from "@app/temporal/agent_loop/lib/event_coalescer";
import type { GenerationTokensEvent } from "@app/types/assistant/generation";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("EventCoalescer", () => {
  let publishMock: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    publishMock = vi
      .spyOn(streamingEvents, "publishConversationRelatedEvent")
      .mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
    publishMock.mockRestore();
  });

  const createTokenEvent = (
    text: string,
    classification: "tokens" | "chain_of_thought" = "tokens"
  ): GenerationTokensEvent => ({
    type: "generation_tokens",
    created: Date.now(),
    configurationId: "config123",
    messageId: "msg123",
    text,
    classification,
  });

  const createActionEvent = (): AgentMessageEvents => ({
    type: "agent_action_success",
    created: Date.now(),
    configurationId: "config123",
    messageId: "msg123",
    action: {
      id: 123,
      sId: "action123",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agentMessageId: 456,
      internalMCPServerName: null,
      toolName: "test_tool",
      mcpServerId: "mcp123",
      functionCallName: "test_function",
      functionCallId: "fc123",
      params: {},
      citationsAllocated: 0,
      status: "succeeded",
      step: 0,
      executionDurationMs: null,
      generatedFiles: [],
      output: null,
      displayLabels: null,
    },
  });

  const createErrorEvent = (): AgentMessageEvents => ({
    type: "agent_error",
    created: Date.now(),
    configurationId: "config123",
    messageId: "msg123",
    error: {
      code: "test_error",
      message: "Test error",
      metadata: {},
    },
  });

  describe("Token Batching", () => {
    it("batches multiple tokens within 100ms", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0;

      // Send 5 tokens rapidly
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token1"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token2"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token3"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token4"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token5"),
      });

      // No publishes yet
      expect(publishMock).toHaveBeenCalledTimes(0);

      // Advance timer by 100ms
      await vi.advanceTimersByTimeAsync(100);

      // Should have published once with concatenated text
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          type: "generation_tokens",
          text: "token1token2token3token4token5",
        }),
        step: 0,
      });
    });

    it("starts new batch after flush completes", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0;

      // First batch
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("batch1token1"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("batch1token2"),
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "batch1token1batch1token2",
        }),
        step: 0,
      });

      publishMock.mockClear();

      // Second batch
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("batch2token1"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("batch2token2"),
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "batch2token1batch2token2",
        }),
        step: 0,
      });
    });
  });

  describe("Event Ordering", () => {
    it("flushes pending tokens before non-token events", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0; // Send 3 tokens
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token1"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token2"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token3"),
      });

      // Before timer expires, send an action event
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createActionEvent(),
      });

      // Should have flushed tokens and published action (2 calls)
      expect(publishMock).toHaveBeenCalledTimes(2);

      // First call: batched tokens
      expect(publishMock).toHaveBeenNthCalledWith(1, {
        conversationId: "conv123",
        event: expect.objectContaining({
          type: "generation_tokens",
          text: "token1token2token3",
        }),
        step: 0,
      });

      // Second call: action event
      expect(publishMock).toHaveBeenNthCalledWith(2, {
        conversationId: "conv123",
        event: expect.objectContaining({
          type: "agent_action_success",
        }),
        step: 0,
      });
    });

    it("preserves event order with mixed event sequence", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0; // token1, token2
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token1"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token2"),
      });

      // action (should flush token1+token2)
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createActionEvent(),
      });

      // token3, token4
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token3"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token4"),
      });

      // error (should flush token3+token4)
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createErrorEvent(),
      });

      // Should have 4 publish calls in correct order
      expect(publishMock).toHaveBeenCalledTimes(4);

      // 1. Batched token1+token2 (flushed by action)
      expect(publishMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            text: "token1token2",
          }),
        })
      );

      // 2. Action event
      expect(publishMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "agent_action_success",
          }),
        })
      );

      // 3. Batched token3+token4 (flushed by error)
      expect(publishMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            text: "token3token4",
          }),
        })
      );

      // 4. Error event
      expect(publishMock).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "agent_error",
          }),
        })
      );
    });
  });

  describe("Multiple Buffers", () => {
    it("batches independently for different keys", async () => {
      const key1 = "conv123-msg123-0";
      const key2 = "conv456-msg456-1";
      const conversationId1 = "conv123";
      const conversationId2 = "conv456";

      // Send tokens to key1
      await globalCoalescer.handleEvent({
        key: key1,
        conversationId: conversationId1,
        step: 0,
        event: createTokenEvent("key1token1"),
      });
      await globalCoalescer.handleEvent({
        key: key1,
        conversationId: conversationId1,
        step: 0,
        event: createTokenEvent("key1token2"),
      });

      // Send tokens to key2
      await globalCoalescer.handleEvent({
        key: key2,
        conversationId: conversationId2,
        step: 1,
        event: createTokenEvent("key2token1"),
      });
      await globalCoalescer.handleEvent({
        key: key2,
        conversationId: conversationId2,
        step: 1,
        event: createTokenEvent("key2token2"),
      });

      // Advance timer
      await vi.advanceTimersByTimeAsync(100);

      // Should have published both keys independently
      expect(publishMock).toHaveBeenCalledTimes(2);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "key1token1key1token2",
        }),
        step: 0,
      });
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv456",
        event: expect.objectContaining({
          text: "key2token1key2token2",
        }),
        step: 1,
      });
    });
  });

  describe("Safety Mechanisms", () => {
    it("forces flush after max buffer age", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0;

      // Send first token
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token1"),
      });

      // Advance time by 61 seconds (exceeds MAX_BUFFER_AGE_MS of 60s)
      await vi.advanceTimersByTimeAsync(61_000);

      // Should have force-flushed
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "token1",
        }),
        step: 0,
      });

      publishMock.mockClear();

      // Send another token (should start new buffer)
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token2"),
      });

      // Should not have published yet
      expect(publishMock).toHaveBeenCalledTimes(0);

      // Advance by 100ms
      await vi.advanceTimersByTimeAsync(100);

      // Should publish token2 separately
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "token2",
        }),
        step: 0,
      });
    });

    it("periodic cleanup flushes stale buffers", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0;

      // Send token to create buffer
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("staletoken"),
      });

      // Advance time to make buffer stale (61 seconds)
      await vi.advanceTimersByTimeAsync(61_000);

      // The max buffer age check in handleEvent won't trigger since we're not sending more events
      // So we need to call cleanup() directly to test the cleanup mechanism
      await globalCoalescer.cleanup();

      // Should have flushed the stale buffer
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "staletoken",
        }),
        step: 0,
      });
    });

    it("cleanup flushes accumulated data before deleting", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0;

      // Create buffer with multiple tokens
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token1"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token2"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token3"),
      });

      // Make buffer stale
      await vi.advanceTimersByTimeAsync(61_000);

      // Cleanup
      await globalCoalescer.cleanup();

      // Should have published all accumulated tokens
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "token1token2token3",
        }),
        step: 0,
      });
    });
  });

  describe("Real-world Event Patterns", () => {
    it("handles complete real event sequence with delimiters", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0; // 1. Opening delimiter - should publish immediately
      const openingDelimiter: GenerationTokensEvent = {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: "dust",
        messageId: "msg123",
        text: "<thinking>",
        classification: "opening_delimiter",
        delimiterClassification: "chain_of_thought",
      };
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: openingDelimiter,
      });

      // 2. Multiple chain_of_thought tokens - should batch
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("\nThe user is", "chain_of_thought"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent(" asking for", "chain_of_thought"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent(" a poem", "chain_of_thought"),
      });

      // 3. Closing delimiter - should flush pending chain_of_thought and publish immediately
      const closingDelimiter: GenerationTokensEvent = {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: "dust",
        messageId: "msg123",
        text: "</thinking>",
        classification: "closing_delimiter",
        delimiterClassification: "chain_of_thought",
      };
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: closingDelimiter,
      });

      // 4. Regular tokens after delimiter - should batch separately
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("\n\n", "tokens"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("A poem about", "tokens"),
      });

      // Advance timer to flush regular tokens
      await vi.advanceTimersByTimeAsync(100);

      // Verify the order:
      // Verify the order: 4 publish calls
      expect(publishMock).toHaveBeenCalledTimes(4);

      // 1. Opening delimiter published immediately
      expect(publishMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            classification: "opening_delimiter",
            text: "<thinking>",
          }),
        })
      );

      // 2. Batched chain_of_thought tokens (flushed by closing delimiter)
      expect(publishMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            classification: "chain_of_thought",
            text: "\nThe user is asking for a poem",
          }),
        })
      );

      // 3. Closing delimiter published immediately
      expect(publishMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            classification: "closing_delimiter",
            text: "</thinking>",
          }),
        })
      );

      // 4. Batched regular tokens (flushed by timer)
      expect(publishMock).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            classification: "tokens",
            text: "\n\nA poem about",
          }),
        })
      );
    });

    it("handles opening_delimiter flushing pending tokens", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0; // Send regular tokens
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token1"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("token2"),
      });

      // Send opening_delimiter (should flush pending tokens first)
      const openingDelimiterEvent: GenerationTokensEvent = {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: "config123",
        messageId: "msg123",
        text: "<thinking>",
        classification: "opening_delimiter",
        delimiterClassification: "chain_of_thought",
      };
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: openingDelimiterEvent,
      });

      // Should have flushed batched tokens, then published delimiter
      expect(publishMock).toHaveBeenCalledTimes(2);

      // First: batched tokens
      expect(publishMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            classification: "tokens",
            text: "token1token2",
          }),
        })
      );

      // Second: opening delimiter
      expect(publishMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            classification: "opening_delimiter",
            text: "<thinking>",
          }),
        })
      );
    });

    it("handles closing_delimiter flushing pending tokens", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0; // Send chain_of_thought tokens
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("thought1", "chain_of_thought"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("thought2", "chain_of_thought"),
      });

      // Send closing_delimiter (should flush pending chain_of_thought tokens first)
      const closingDelimiterEvent: GenerationTokensEvent = {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: "config123",
        messageId: "msg123",
        text: "</thinking>",
        classification: "closing_delimiter",
        delimiterClassification: "chain_of_thought",
      };
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: closingDelimiterEvent,
      });

      // Should have flushed batched chain_of_thought tokens, then published delimiter
      expect(publishMock).toHaveBeenCalledTimes(2);

      // First: batched chain_of_thought tokens
      expect(publishMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            classification: "chain_of_thought",
            text: "thought1thought2",
          }),
        })
      );

      // Second: closing delimiter
      expect(publishMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          event: expect.objectContaining({
            type: "generation_tokens",
            classification: "closing_delimiter",
            text: "</thinking>",
          }),
        })
      );
    });

    it("flushes buffer when classification changes from tokens to chain_of_thought", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0;

      // Send regular tokens
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("regular ", "tokens"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("tokens", "tokens"),
      });

      // Send chain_of_thought token (should flush regular tokens first)
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("thought", "chain_of_thought"),
      });

      // Should have published regular tokens when classification changed
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "regular tokens",
          classification: "tokens",
        }),
        step: 0,
      });

      publishMock.mockClear();

      // Advance timer to flush chain_of_thought tokens
      await vi.advanceTimersByTimeAsync(100);

      // Should have published chain_of_thought separately
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "thought",
          classification: "chain_of_thought",
        }),
        step: 0,
      });
    });

    it("flushes buffer when classification changes from chain_of_thought to tokens", async () => {
      const key = "conv123-msg123-0";
      const conversationId = "conv123";
      const step = 0;

      // Send chain_of_thought tokens
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("thinking ", "chain_of_thought"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("hard", "chain_of_thought"),
      });

      // Send regular token (should flush chain_of_thought first)
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("output", "tokens"),
      });

      // Should have published chain_of_thought tokens when classification changed
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv123",
        event: expect.objectContaining({
          text: "thinking hard",
          classification: "chain_of_thought",
        }),
        step: 0,
      });
    });

    it("batches same-classification tokens after different classification", async () => {
      // This test verifies that after a classification change, tokens with the
      // same classification still batch correctly in the new buffer
      // Use unique key to avoid state pollution from previous tests
      const key = "conv-batch-test-msg123-0";
      const conversationId = "conv-batch-test";
      const step = 0;

      // First send regular tokens
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("regular", "tokens"),
      });

      // Switch to chain_of_thought (flushes previous buffer)
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("thought1", "chain_of_thought"),
      });

      // Verify first buffer was flushed
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv-batch-test",
        event: expect.objectContaining({
          text: "regular",
          classification: "tokens",
        }),
        step: 0,
      });

      publishMock.mockClear();

      // Continue adding chain_of_thought tokens - these should batch together
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("thought2", "chain_of_thought"),
      });
      await globalCoalescer.handleEvent({
        key,
        conversationId,
        step,
        event: createTokenEvent("thought3", "chain_of_thought"),
      });

      await vi.advanceTimersByTimeAsync(100);

      // Should batch all chain_of_thought tokens together
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith({
        conversationId: "conv-batch-test",
        event: expect.objectContaining({
          text: "thought1thought2thought3",
          classification: "chain_of_thought",
        }),
        step: 0,
      });
    });
  });
});
