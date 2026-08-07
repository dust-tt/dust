import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import type { SandboxFunctionPollerStreamEvent } from "@app/lib/api/sandbox_functions/poller_channel";
import {
  claimInvocationForExec,
  claimPollerJob,
  clearPollerChannelPresence,
  isPollerChannelOpen,
  openPollerChannel,
  POLLER_MAX_JOB_TIMEOUT_MS,
  publishPollerJob,
  refreshPollerChannelPresence,
} from "@app/lib/api/sandbox_functions/poller_channel";
import type { SandboxFunctionPollerJob } from "@app/types/api/sandbox_functions";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the hybrid manager's stream half: enough to exercise what the channel depends on,
// which is that a subscriber resuming from an event id gets everything published after it.
const publishedEvents: EventPayload[] = [];
const subscribeCalls: {
  lastEventId: string | null;
  skipHistory: boolean;
}[] = [];

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: () => ({
    publish: async (_channel: string, payload: string) => {
      const eventId = `${publishedEvents.length + 1}-0`;
      publishedEvents.push({ id: eventId, message: { payload } });
      return eventId;
    },
    subscribe: async (
      _channel: string,
      _callback: unknown,
      _origin: string,
      {
        lastEventId = null,
        skipHistory = false,
      }: { lastEventId?: string | null; skipHistory?: boolean }
    ) => {
      subscribeCalls.push({ lastEventId, skipHistory });
      if (skipHistory) {
        return { history: [], unsubscribe: () => {} };
      }
      const startIndex =
        lastEventId === null
          ? 0
          : publishedEvents.findIndex((event) => event.id === lastEventId) + 1;
      return {
        history: publishedEvents.slice(startIndex),
        unsubscribe: () => {},
      };
    },
  }),
}));

function makeJob(invocationId: string): SandboxFunctionPollerJob {
  return {
    invocationId,
    functionId: "sfn_test",
    slug: "get-state",
    execToken: "sbt-job",
    inputEnvelope: JSON.stringify({ method: "POST", body: "secret-input" }),
    envVars: { DUST_API_URL: "https://dust.example" },
    // The ceiling rather than a comfortable value: a fixture that always sits well inside the
    // claim's lifetime is what would hide a claim that expires mid-run.
    timeoutMs: POLLER_MAX_JOB_TIMEOUT_MS,
  };
}

// A connect stays open for a minute waiting for live jobs, which no test wants to sit through:
// stop as soon as the events the test is about have arrived.
async function collectChannel({
  sandboxId,
  lastEventId,
  expectedEvents,
}: {
  sandboxId: string;
  lastEventId: string | null;
  expectedEvents: number;
}): Promise<SandboxFunctionPollerStreamEvent[]> {
  const controller = new AbortController();
  const events: SandboxFunctionPollerStreamEvent[] = [];
  for await (const event of openPollerChannel({
    sandboxId,
    rotatedToken: "sbt-rotated",
    lastEventId,
    signal: controller.signal,
  })) {
    events.push(event);
    if (events.length >= expectedEvents) {
      controller.abort();
      break;
    }
  }
  return events;
}

describe("Pod function poller channel", () => {
  beforeEach(() => {
    publishedEvents.length = 0;
    subscribeCalls.length = 0;
  });

  it("reports a pod as reachable only while its presence is held", async () => {
    expect(await isPollerChannelOpen({ sandboxId: "sbx_1" })).toBe(false);

    await refreshPollerChannelPresence({
      sandboxId: "sbx_1",
      connectId: "connect-1",
    });
    expect(await isPollerChannelOpen({ sandboxId: "sbx_1" })).toBe(true);

    await clearPollerChannelPresence({
      sandboxId: "sbx_1",
      connectId: "connect-1",
    });
    expect(await isPollerChannelOpen({ sandboxId: "sbx_1" })).toBe(false);
  });

  it("keeps presence scoped to one sandbox", async () => {
    await refreshPollerChannelPresence({
      sandboxId: "sbx_1",
      connectId: "connect-1",
    });

    expect(await isPollerChannelOpen({ sandboxId: "sbx_1" })).toBe(true);
    expect(await isPollerChannelOpen({ sandboxId: "sbx_2" })).toBe(false);
  });

  it("does not let a closing connect clear the presence of the one that replaced it", async () => {
    // The poller reconnects every minute, and nothing orders the old connect's cleanup against
    // the new one's opening. If cleanup won, the pod would look unreachable while it is in fact
    // listening, and its invocations would take the slow path for no reason.
    await refreshPollerChannelPresence({
      sandboxId: "sbx_1",
      connectId: "connect-1",
    });
    await refreshPollerChannelPresence({
      sandboxId: "sbx_1",
      connectId: "connect-2",
    });

    await clearPollerChannelPresence({
      sandboxId: "sbx_1",
      connectId: "connect-1",
    });

    expect(await isPollerChannelOpen({ sandboxId: "sbx_1" })).toBe(true);
  });

  it("hands the job to exactly one claimer", async () => {
    await publishPollerJob(makeJob("sfi_1"), { sandboxId: "sbx_1" });

    const job = await claimPollerJob({
      invocationId: "sfi_1",
      sandboxId: "sbx_1",
    });
    expect(job).toMatchObject({ invocationId: "sfi_1", execToken: "sbt-job" });

    // The exec fallback is locked out, and a replayed doorbell does not get a second copy either.
    expect(await claimInvocationForExec({ invocationId: "sfi_1" })).toBe(false);
    expect(
      await claimPollerJob({ invocationId: "sfi_1", sandboxId: "sbx_1" })
    ).toBeNull();
  });

  it("locks the poller out once the exec fallback has claimed", async () => {
    await publishPollerJob(makeJob("sfi_1"), { sandboxId: "sbx_1" });

    expect(await claimInvocationForExec({ invocationId: "sfi_1" })).toBe(true);

    expect(
      await claimPollerJob({ invocationId: "sfi_1", sandboxId: "sbx_1" })
    ).toBeNull();
  });

  it("claims invocations independently", async () => {
    await publishPollerJob(makeJob("sfi_1"), { sandboxId: "sbx_1" });

    expect(
      await claimPollerJob({ invocationId: "sfi_1", sandboxId: "sbx_1" })
    ).not.toBeNull();
    expect(await claimInvocationForExec({ invocationId: "sfi_2" })).toBe(true);
  });

  it("refuses a claim from a pod the job was not dispatched to", async () => {
    // Invocation ids come from a public sqids alphabet, so a compromised pod can guess ids
    // belonging to other pods and other workspaces. If claiming them worked, it could stop them
    // running anywhere without ever running them itself.
    await publishPollerJob(makeJob("sfi_1"), { sandboxId: "sbx_1" });

    expect(
      await claimPollerJob({ invocationId: "sfi_1", sandboxId: "sbx_2" })
    ).toBeNull();
    // The rightful pod is unaffected.
    expect(
      await claimPollerJob({ invocationId: "sfi_1", sandboxId: "sbx_1" })
    ).not.toBeNull();
  });

  it("refuses a claim for an invocation that was never dispatched", async () => {
    expect(
      await claimPollerJob({ invocationId: "sfi_unknown", sandboxId: "sbx_1" })
    ).toBeNull();
  });

  it("refuses to publish a job that would outlive its claim", async () => {
    await expect(
      publishPollerJob(
        { ...makeJob("sfi_1"), timeoutMs: POLLER_MAX_JOB_TIMEOUT_MS + 1 },
        { sandboxId: "sbx_1" }
      )
    ).rejects.toThrow(/cannot run for longer/);
  });

  it("keeps the invocation's credential out of the work channel", async () => {
    await publishPollerJob(makeJob("sfi_1"), { sandboxId: "sbx_1" });

    // The channel's history is replayable by any holder of a poller token, so a credential
    // published there would be readable long after the invocation it belonged to.
    const published = publishedEvents.map((event) => event.message.payload);
    expect(published.join("")).not.toContain("sbt-job");
    expect(published.join("")).not.toContain("secret-input");
  });

  it("hands the poller its next token first", async () => {
    const events = await collectChannel({
      sandboxId: "sbx_1",
      lastEventId: null,
      expectedEvents: 1,
    });

    expect(events[0]?.data).toMatchObject({
      type: "sandbox_function_poller_token",
      token: "sbt-rotated",
    });
  });

  it("gives a poller with no resume point no backlog", async () => {
    // A poller connecting without a resume point is starting fresh, not catching up. Replaying
    // from the start of a stream retained for minutes would re-ring invocations the exec fallback
    // has long since run, and hand out doorbells for work that is finished.
    await publishPollerJob(makeJob("sfi_1"), { sandboxId: "sbx_1" });

    const events = await collectChannel({
      sandboxId: "sbx_1",
      lastEventId: null,
      expectedEvents: 1,
    });

    expect(subscribeCalls.at(-1)?.skipHistory).toBe(true);
    expect(
      events.filter(
        (event) => event.data.type === "sandbox_function_poller_job"
      )
    ).toEqual([]);
  });

  it("marks the pod reachable while the channel is open and drops it after", async () => {
    let presenceDuringChannel = false;
    const controller = new AbortController();
    for await (const _event of openPollerChannel({
      sandboxId: "sbx_1",
      rotatedToken: "sbt-rotated",
      lastEventId: null,
      signal: controller.signal,
    })) {
      presenceDuringChannel = await isPollerChannelOpen({ sandboxId: "sbx_1" });
      controller.abort();
      break;
    }

    expect(presenceDuringChannel).toBe(true);
    expect(await isPollerChannelOpen({ sandboxId: "sbx_1" })).toBe(false);
  });

  it("replays only the doorbells rung after the poller's last event", async () => {
    await publishPollerJob(makeJob("sfi_1"), { sandboxId: "sbx_1" });
    await publishPollerJob(makeJob("sfi_2"), { sandboxId: "sbx_1" });
    // Rung while the poller was reconnecting: it must still be answered.
    await publishPollerJob(makeJob("sfi_3"), { sandboxId: "sbx_1" });

    const firstDoorbellId = publishedEvents[0]?.id ?? null;
    const resumed = await collectChannel({
      sandboxId: "sbx_1",
      lastEventId: firstDoorbellId,
      expectedEvents: 3,
    });
    const resumedInvocationIds = resumed.flatMap((event) =>
      event.data.type === "sandbox_function_poller_job"
        ? [event.data.invocationId]
        : []
    );

    expect(subscribeCalls.at(-1)?.lastEventId).toBe(firstDoorbellId);
    expect(resumedInvocationIds).toEqual(["sfi_2", "sfi_3"]);
  });

  it("does not rewind a poller that stores the token event's id", async () => {
    // The token event is per-connect state, not progress through the job history. If it carried a
    // fresh id, a poller storing every id it sees would resume from it and lose its place.
    await publishPollerJob(makeJob("sfi_1"), { sandboxId: "sbx_1" });
    const resumePoint = publishedEvents[0]?.id ?? null;

    const events = await collectChannel({
      sandboxId: "sbx_1",
      lastEventId: resumePoint,
      expectedEvents: 1,
    });

    expect(events[0]?.data.type).toBe("sandbox_function_poller_token");
    expect(events[0]?.eventId).toBe(resumePoint);
  });
});
