import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import { makeTestFrameInvocation } from "@app/tests/utils/FrameFunctionFactory";
import type { SandboxFunctionInvocationEvent } from "@app/types/api/sandbox_functions";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox_functions/events", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/events")
    >();
  return {
    ...mod,
    publishSandboxFunctionInvocationEvent: vi.fn(),
    getSandboxFunctionInvocationEvents: vi.fn(async function* () {}),
  };
});

function getEvents({
  workspaceId,
  frameId,
  invocationId,
}: {
  workspaceId: string;
  frameId: string;
  invocationId: string;
}) {
  return honoApp.request(
    `/api/sse/w/${workspaceId}/frames/${frameId}/invocations/${invocationId}/events`
  );
}

function mockEventStream(event: SandboxFunctionInvocationEvent) {
  vi.mocked(getSandboxFunctionInvocationEvents).mockImplementation(
    async function* () {
      yield { eventId: "event-1", data: event };
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sse/w/:wId/frames/:frameId/invocations/:invocationId/events", () => {
  it("keeps an invocation streamable after the Frame republishes", async () => {
    const { frame, invocation, sandboxFunction, workspace } =
      await makeTestFrameInvocation();
    await frame.setActiveFramePublication({
      publicationId: "publication-2",
      name: "Task List",
      description: "Track tasks.",
    });
    mockEventStream({
      type: "sandbox_function_invocation_result",
      created: Date.now(),
      invocationId: invocation.sId,
      functionId: sandboxFunction.sId,
      result: { ok: true },
    });

    const response = await getEvents({
      workspaceId: workspace.sId,
      frameId: frame.sId,
      invocationId: invocation.sId,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"result":{"ok":true}');
    expect(getSandboxFunctionInvocationEvents).toHaveBeenCalledWith({
      invocationId: invocation.sId,
      lastEventId: null,
      signal: expect.any(AbortSignal),
    });
  });

  it("rechecks Frame use rights", async () => {
    const { adminAuth, frame, invocation, workspace } =
      await makeTestFrameInvocation();
    await frame.setShareScope(adminAuth, "emails_only");

    const response = await getEvents({
      workspaceId: workspace.sId,
      frameId: frame.sId,
      invocationId: invocation.sId,
    });

    expect(response.status).toBe(404);
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });

  it("is available only behind frames_v2", async () => {
    const { frame, invocation, workspace } = await makeTestFrameInvocation({
      enableFramesV2: false,
    });

    const response = await getEvents({
      workspaceId: workspace.sId,
      frameId: frame.sId,
      invocationId: invocation.sId,
    });

    expect(response.status).toBe(403);
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });
});
