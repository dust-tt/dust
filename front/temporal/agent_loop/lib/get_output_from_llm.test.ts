import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  getToolCallStartDeduplicationKeys,
  resolveStableToolCallName,
  withPeriodicHeartbeat,
} from "@app/temporal/agent_loop/lib/get_output_from_llm";
import { CancelledFailure } from "@temporalio/activity";
import { beforeEach, describe, expect, it, vi } from "vitest";

const activityState = vi.hoisted(() => {
  return {
    // Pending forever by default; tests override it to simulate cancellation.
    cancelled: new Promise<never>(() => {}),
  };
});

vi.mock("@temporalio/activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@temporalio/activity")>();
  return {
    ...actual,
    heartbeat: vi.fn(),
    Context: {
      current: () => ({ cancelled: activityState.cancelled }),
    },
  };
});

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

describe("withPeriodicHeartbeat", () => {
  beforeEach(() => {
    activityState.cancelled = new Promise<never>(() => {});
  });

  it("forwards stream values when the activity is not cancelled", async () => {
    async function* source() {
      yield "a";
      yield "b";
    }

    const values: string[] = [];
    for await (const value of withPeriodicHeartbeat(
      source(),
      Date.now() + 60_000
    )) {
      values.push(value);
    }

    expect(values).toEqual(["a", "b"]);
  });

  it("aborts the stream when the activity is cancelled while waiting for an event", async () => {
    let rejectCancelled: (err: Error) => void = () => {};
    activityState.cancelled = new Promise<never>((_, reject) => {
      rejectCancelled = reject;
    });

    // Simulates a model thinking without emitting any event.
    const streamReturn = vi.fn(
      async (): Promise<IteratorResult<string>> =>
        ({
          done: true,
          value: undefined,
        }) satisfies IteratorReturnResult<undefined>
    );
    const neverYieldingStream: AsyncIterator<string> = {
      next: () => new Promise<IteratorResult<string>>(() => {}),
      return: streamReturn,
    };

    const generator = withPeriodicHeartbeat(
      neverYieldingStream,
      Date.now() + 60_000
    );
    const nextPromise = generator.next();

    rejectCancelled(new CancelledFailure("activity cancelled"));

    await expect(nextPromise).rejects.toBeInstanceOf(CancelledFailure);
    // The underlying stream must be closed, aborting the HTTP connection to the provider.
    expect(streamReturn).toHaveBeenCalledOnce();
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
