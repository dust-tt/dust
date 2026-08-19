import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  getToolCallStartDeduplicationKeys,
  resolveStableToolCallName,
  withPeriodicHeartbeat,
} from "@app/temporal/agent_loop/lib/get_output_from_llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shutdownMock = vi.hoisted(() => ({ controller: new AbortController() }));

vi.mock("@app/lib/shutdown_signal", () => ({
  DUST_WORKER_SHUTDOWN_ABORT_REASON: "DUST_WORKER_SHUTDOWN_ABORT",
  getShutdownSignal: () => shutdownMock.controller.signal,
  markShuttingDownWithDelayedAbort: vi.fn(),
}));

vi.mock("@temporalio/activity", () => ({
  CancelledFailure: class CancelledFailure extends Error {},
  heartbeat: vi.fn(),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

const specifications: AgentActionSpecification[] = [
  {
    name: "create_interactive_content_file",
    description: "Create an interactive content file.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "common_utilities__wait",
    description: "Wait for a duration.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

describe("resolveStableToolCallName", () => {
  it("returns the exact tool name when it matches a known specification", () => {
    expect(
      resolveStableToolCallName(
        specifications,
        "create_interactive_content_file"
      )
    ).toBe("create_interactive_content_file");
  });

  it("does not treat a partial streamed tool name as stable", () => {
    expect(
      resolveStableToolCallName(specifications, "create_inter")
    ).toBeNull();
  });
});

describe("getToolCallStartDeduplicationKeys", () => {
  it("uses both id and index when both are available", () => {
    expect(
      getToolCallStartDeduplicationKeys({
        stableToolName: "create_interactive_content_file",
        toolCallId: "call_123",
        toolCallIndex: 0,
      })
    ).toEqual(["id:call_123", "index:0"]);
  });

  it("falls back to name only when neither id nor index is available", () => {
    expect(
      getToolCallStartDeduplicationKeys({
        stableToolName: "create_interactive_content_file",
      })
    ).toEqual(["name:create_interactive_content_file"]);
  });
});

describe("withPeriodicHeartbeat", () => {
  beforeEach(() => {
    shutdownMock.controller = new AbortController();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes stream values through and closes the stream when done", async () => {
    const returnFn = vi.fn().mockResolvedValue({ done: true });
    const values = ["a", "b"][Symbol.iterator]();
    const stream: AsyncIterator<string> = {
      next: async () => {
        const { value, done } = values.next();
        return done ? { value: undefined, done: true } : { value, done: false };
      },
      return: returnFn,
    };

    const collected: string[] = [];
    for await (const value of withPeriodicHeartbeat(
      stream,
      Date.now() + 600_000
    )) {
      collected.push(value);
    }

    expect(collected).toEqual(["a", "b"]);
    expect(returnFn).toHaveBeenCalled();
  });

  it("fails fast on worker shutdown even when the provider stream is stalled", async () => {
    // next() never resolves (stalled provider read) and return() never settles either: the
    // async generator method queue would block cleanup behind the in-flight next().
    const returnFn = vi.fn(() => new Promise<IteratorResult<string>>(() => {}));
    const stalledStream: AsyncIterator<string> = {
      next: () => new Promise(() => {}),
      return: returnFn,
    };

    const generator = withPeriodicHeartbeat(
      stalledStream,
      Date.now() + 600_000
    );
    const pending = generator.next();
    const assertion = expect(pending).rejects.toThrow(
      "Model activity interrupted by worker shutdown"
    );

    shutdownMock.controller.abort("DUST_WORKER_SHUTDOWN_ABORT");

    // The bounded cleanup (2s) is the only wait: well within the 10s shutdown buffer.
    await vi.advanceTimersByTimeAsync(3_000);

    await assertion;
    expect(returnFn).toHaveBeenCalled();
  });
});
