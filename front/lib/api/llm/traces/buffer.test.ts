import { faker } from "@faker-js/faker";
import { expect, test, vi } from "vitest";

import type { LLMTraceId } from "@app/lib/api/llm/traces/buffer";
import {
  createLLMTraceId,
  LLMTraceBuffer,
} from "@app/lib/api/llm/traces/buffer";
import type {
  TextDeltaEvent,
  TextGeneratedEvent,
  TokenUsageEvent,
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";

// Mock GCS bucket to avoid external dependencies.
vi.mock("@app/lib/file_storage", () => ({
  getLLMTracesBucket: () => ({
    uploadRawContentToBucket: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Test fixtures for LLM events.
class LLMEventFactory {
  static textDelta(delta: string = faker.lorem.word()): TextDeltaEvent {
    return {
      type: "text_delta",
      content: { delta },
      metadata: { clientId: "test", modelId: "gpt-4-turbo" },
    };
  }

  static textGenerated(
    text: string = faker.lorem.sentence()
  ): TextGeneratedEvent {
    return {
      type: "text_generated",
      content: { text },
      metadata: { clientId: "test", modelId: "gpt-4-turbo" },
    };
  }

  static toolCall(): ToolCallEvent {
    return {
      type: "tool_call",
      content: {
        id: faker.string.uuid(),
        name: faker.hacker.verb(),
        arguments: { query: faker.lorem.sentence() },
      },
      metadata: { clientId: "test", modelId: "gpt-4-turbo" },
    };
  }

  static tokenUsage(): TokenUsageEvent {
    return {
      type: "token_usage",
      content: {
        inputTokens: faker.number.int({ min: 10, max: 1000 }),
        outputTokens: faker.number.int({ min: 10, max: 1000 }),
        totalTokens: 0, // Will be calculated
      },
      metadata: { clientId: "test", modelId: "gpt-4-turbo" },
    };
  }

  static error(): EventError {
    return new EventError(
      {
        type: "maximum_length",
        isRetryable: false,
        message: "Maximum length reached",
      },
      { clientId: "test", modelId: "gpt-4-turbo" }
    );
  }
}

// Helper to create buffer with test data
function createTestBuffer(traceId?: LLMTraceId, workspaceId?: string) {
  const buffer = new LLMTraceBuffer(
    traceId ?? createLLMTraceId(faker.string.uuid()),
    workspaceId ?? faker.string.uuid(),
    {
      operationType: "agent_conversation",
      contextId: faker.string.uuid(),
      userId: faker.string.uuid(),
    }
  );

  buffer.setInput({
    conversation: { messages: [] },
    modelId: "gpt-4-turbo",
    prompt: faker.lorem.paragraph(),
    reasoningEffort: "medium",
    responseFormat: null,
    specifications: [],
    temperature: 0.7,
  });

  return buffer;
}

test("buffer processes text delta events correctly", () => {
  const buffer = createTestBuffer();

  const delta1 = LLMEventFactory.textDelta("Hello ");
  const delta2 = LLMEventFactory.textDelta("world!");

  expect(buffer.addEvent(delta1)).toBe(true);
  expect(buffer.addEvent(delta2)).toBe(true);

  const events = buffer.getProcessedEvents();
  expect(events.content).toBe("Hello world!");
});

test("buffer handles text replacement events", () => {
  const buffer = createTestBuffer();

  // Add some delta events first.
  buffer.addEvent(LLMEventFactory.textDelta("Initial "));
  buffer.addEvent(LLMEventFactory.textDelta("text"));

  // Replace with generated text.
  const replacement = LLMEventFactory.textGenerated("Completely new text");
  expect(buffer.addEvent(replacement)).toBe(true);

  const events = buffer.getProcessedEvents();
  expect(events.content).toBe("Completely new text");
});

test("buffer collects tool calls correctly", () => {
  const buffer = createTestBuffer();

  const toolCall1 = LLMEventFactory.toolCall();
  const toolCall2 = LLMEventFactory.toolCall();

  expect(buffer.addEvent(toolCall1)).toBe(true);
  expect(buffer.addEvent(toolCall2)).toBe(true);

  const events = buffer.getProcessedEvents();
  expect(events.toolCalls).toHaveLength(2);
  expect(events.toolCalls[0].id).toBe(toolCall1.content.id);
  expect(events.toolCalls[1].id).toBe(toolCall2.content.id);
});

test("buffer respects 64KB size limit", () => {
  const buffer = createTestBuffer();

  // Create a large text event that would exceed 64KB.
  const largeText = "A".repeat(70 * 1024); // 70KB.
  const largeEvent = LLMEventFactory.textGenerated(largeText);

  expect(buffer.addEvent(largeEvent)).toBe(false);
  expect(buffer.isTruncated()).toBe(true);

  const events = buffer.getProcessedEvents();
  expect(events.content).toContain("[TRUNCATED: Output size limit reached]");
});

test("buffer rejects events after truncation", () => {
  const buffer = createTestBuffer();

  // Force truncation with large event.
  const largeText = "B".repeat(70 * 1024);
  buffer.addEvent(LLMEventFactory.textGenerated(largeText));
  expect(buffer.isTruncated()).toBe(true);

  // Subsequent events should be rejected.
  const nextEvent = LLMEventFactory.textDelta("This should be ignored");
  expect(buffer.addEvent(nextEvent)).toBe(false);

  const events = buffer.getProcessedEvents();
  expect(events.content).not.toContain("This should be ignored");
});

test("buffer calculates size correctly for UTF-8 content", () => {
  const buffer = createTestBuffer();

  // Use international characters that take more bytes than string length.
  const unicodeText = "🎉🚀✨"; // 3 chars, but ~9-12 bytes in UTF-8.
  const unicodeEvent = LLMEventFactory.textDelta(unicodeText);

  expect(buffer.addEvent(unicodeEvent)).toBe(true);

  const events = buffer.getProcessedEvents();
  expect(events.content).toBe(unicodeText);

  // Size should be based on UTF-8 byte length, not string length.
  expect(buffer.outputSize).toBeGreaterThan(unicodeText.length);
});

test("buffer generates complete trace JSON", () => {
  const traceId = createLLMTraceId(faker.string.uuid());
  const workspaceId = faker.string.uuid();
  const buffer = createTestBuffer(traceId, workspaceId);

  // Add some events.
  buffer.addEvent(LLMEventFactory.textDelta("Hello world"));
  const toolCall = LLMEventFactory.toolCall();
  buffer.addEvent(toolCall);

  const trace = buffer.toTraceJSON({
    startTimestamp: "2024-01-01T00:00:00.000Z",
    endTimestamp: "2024-01-01T00:00:01.000Z",
    durationMs: 1000,
  });

  expect(trace.traceId).toBe(traceId);
  expect(trace.workspaceId).toBe(workspaceId);
  expect(trace.metadata.durationMs).toBe(1000);
  expect(trace.output?.content).toBe("Hello world");
  expect(trace.output?.toolCalls).toHaveLength(1);
  expect(trace.output?.toolCalls?.[0].id).toBe(toolCall.content.id);
});

test("buffer includes truncation metadata when truncated", () => {
  const buffer = createTestBuffer();

  // Force truncation.
  const largeText = "C".repeat(70 * 1024);
  buffer.addEvent(LLMEventFactory.textGenerated(largeText));

  const trace = buffer.toTraceJSON({
    startTimestamp: "2024-01-01T00:00:00.000Z",
    endTimestamp: "2024-01-01T00:00:01.000Z",
    durationMs: 1000,
  });

  expect(trace.metadata.bufferTruncated).toBe(true);
  expect(trace.metadata.capturedBytes).toBeGreaterThan(0);
  expect(trace.metadata.truncationReason).toContain("64KB limit");
});

test("buffer handles error traces correctly", () => {
  const buffer = createTestBuffer();

  // Add some content before error.
  buffer.addEvent(LLMEventFactory.textDelta("Partial content"));
  buffer.addEvent(LLMEventFactory.error());

  const trace = buffer.toTraceJSON({
    startTimestamp: "2024-01-01T00:00:00.000Z",
    endTimestamp: "2024-01-01T00:00:01.000Z",
    durationMs: 1000,
  });

  expect(trace.error?.message).toBe("Maximum length reached");
  expect(trace.error?.partialCompletion).toBe(true);
  expect(trace.output).toBeUndefined();
});

test("buffer size estimation is reasonably accurate", () => {
  const buffer = createTestBuffer();

  // Add content near the size limit.
  const sizeLimit = 64 * 1024; // 64KB.
  const testText = "x".repeat(sizeLimit - 1000); // Leave some margin.

  buffer.addEvent(LLMEventFactory.textGenerated(testText));

  const currentSize = buffer.outputSize;
  expect(currentSize).toBeLessThan(sizeLimit);
  expect(currentSize).toBeGreaterThan(sizeLimit - 2000); // Should be close.

  // Add a small event that should still fit.
  const smallEvent = LLMEventFactory.textDelta(" small");
  expect(buffer.addEvent(smallEvent)).toBe(true);
  expect(buffer.isTruncated()).toBe(false);
});
