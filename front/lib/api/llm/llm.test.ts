import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { LLM } from "@app/lib/api/llm/llm";
import type {
  LLMEvent,
  TextGeneratedEvent,
} from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { StreamParameters } from "@app/lib/api/llm/types/options";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";

// Helper: minimal non-tracing `authenticator` so streamWithTracing bypasses tracing.
function makeAuth(): Authenticator {
  return new Authenticator({
    role: "none",
    groups: [],
    user: null,
    workspace: null,
    subscription: null,
  });
}

// Helpers to build events used in tests.
const metadata = { clientId: "test", modelId: "gpt-4-turbo" } as const;

function textEvent(text: string): TextGeneratedEvent {
  return { type: "text_generated", content: { text }, metadata };
}

function retryableError(message = "Retryable error"): EventError {
  return new EventError(
    {
      type: "overloaded_error",
      isRetryable: true,
      message,
    },
    metadata
  );
}

function nonRetryableError(message = "Fatal error"): EventError {
  return new EventError(
    {
      type: "context_length_exceeded",
      isRetryable: false,
      message,
    },
    metadata
  );
}

// Test double: LLM subclass with scripted attempts.
class TestLLM extends LLM {
  private readonly attempts: LLMEvent[][];
  public internalCalls = 0;

  constructor(attempts: LLMEvent[][]) {
    super(makeAuth(), { clientId: "test", modelId: "gpt-4-turbo" });
    this.attempts = attempts;
  }

  protected async *internalStream(
    _: StreamParameters
  ): AsyncGenerator<LLMEvent> {
    this.internalCalls += 1;
    const idx = this.internalCalls - 1;
    const events = this.attempts[idx] ?? [];
    for (const e of events) {
      yield e;
    }
  }
}

const defaultArgs: StreamParameters = {
  conversation: { messages: [] },
  prompt: "",
  specifications: [],
};

describe("LLM.stream retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("no error: events pass through, no retries", async () => {
    const llm = new TestLLM([[textEvent("ok")]]);

    const warnSpy = vi.spyOn(logger, "warn");

    const out: LLMEvent[] = [];
    const gen = llm.stream(defaultArgs, {
      retries: 3,
      delayBetweenRetriesMs: 50,
    });
    const consume = (async () => {
      for await (const e of gen) {
        out.push(e);
      }
    })();

    await consume; // no timers to run

    expect(out.map((e) => e.type)).toEqual(["text_generated"]);
    expect(llm.internalCalls).toBe(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("retryable error then success: one retry, backoff, no error yielded", async () => {
    const llm = new TestLLM([[retryableError()], [textEvent("ok")]]);

    const warnSpy = vi.spyOn(logger, "warn");

    const out: LLMEvent[] = [];
    const gen = llm.stream(defaultArgs, {
      retries: 3,
      delayBetweenRetriesMs: 100,
    });

    const consume = (async () => {
      for await (const e of gen) {
        out.push(e);
      }
    })();

    // The first retry waits 100 ms
    await vi.runAllTimersAsync();
    await consume;

    expect(out.map((e) => e.type)).toEqual(["text_generated"]);
    expect(llm.internalCalls).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [firstWarnArgs] = warnSpy.mock.calls as any[];
    expect(firstWarnArgs[0]?.sleepTime).toBe(100);
    expect(firstWarnArgs[0]?.attempt).toBe(1);
  });

  test("non-retryable error: yields error and stops without retry", async () => {
    const llm = new TestLLM([[nonRetryableError()]]);

    const warnSpy = vi.spyOn(logger, "warn");

    const out: LLMEvent[] = [];
    const gen = llm.stream(defaultArgs, {
      retries: 5,
      delayBetweenRetriesMs: 100,
    });

    const consume = (async () => {
      for await (const e of gen) {
        out.push(e);
      }
    })();

    await consume;

    expect(out).toHaveLength(1);
    const e = out[0] as EventError;
    expect(e.type).toBe("error");
    expect(e.content.isRetryable).toBe(false);
    expect(llm.internalCalls).toBe(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("retryable error then non-retryable: retries once then yields non-retryable error", async () => {
    const llm = new TestLLM([[retryableError()], [nonRetryableError()]]);

    const warnSpy = vi.spyOn(logger, "warn");

    const out: LLMEvent[] = [];
    const gen = llm.stream(defaultArgs, {
      retries: 4,
      delayBetweenRetriesMs: 10,
    });

    const consume = (async () => {
      for await (const e of gen) {
        out.push(e);
      }
    })();

    await vi.runAllTimersAsync();
    await consume;

    expect(llm.internalCalls).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const last = out[out.length - 1] as EventError;
    expect(last.type).toBe("error");
    expect(last.content.isRetryable).toBe(false);
  });

  test("too many retries: yields maximum_retries with accumulated errors", async () => {
    const retries = 3;
    const attempts: LLMEvent[][] = Array.from({ length: retries }, () => [
      retryableError(),
    ]);
    const llm = new TestLLM(attempts);

    const warnSpy = vi.spyOn(logger, "warn");

    const out: LLMEvent[] = [];
    const gen = llm.stream(defaultArgs, {
      retries,
      delayBetweenRetriesMs: 200,
    });

    const consume = (async () => {
      for await (const e of gen) {
        out.push(e);
      }
    })();

    await vi.runAllTimersAsync();
    await consume;

    expect(llm.internalCalls).toBe(retries);
    expect(warnSpy).toHaveBeenCalledTimes(retries);

    const types = out.map((e) => e.type);
    // Only the final maximum_retries error should be yielded.
    expect(types).toEqual(["error"]);

    const finalError = out[0] as EventError;
    expect(finalError.content.type).toBe("maximum_retries");
    expect(finalError.accumulatedErrors).toHaveLength(retries);

    // Check quadratic backoff values in `warn` logs
    const sleepTimes = warnSpy.mock.calls.map(
      (args: any[]) => args[0]?.sleepTime
    );
    expect(sleepTimes).toEqual([200, 800, 1800]);
  });
});
