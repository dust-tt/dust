import {
  getSandboxFunctionInvocationEvents,
  getSandboxFunctionInvocationEventsBatch,
} from "@app/lib/api/sandbox_functions/events";
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
    getSandboxFunctionInvocationEventsBatch: vi.fn(),
    getSandboxFunctionInvocationEvents: vi.fn(async function* () {}),
  };
});

describe.each(["", "/poll"])(
  "GET /api/sse/w/:wId/frames/:frameId/invocations/:invocationId/events%s",
  (suffix) => {
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
        `/api/sse/w/${workspaceId}/frames/${frameId}/invocations/${invocationId}/events${suffix}`
      );
    }

    function mockEventStream(event: SandboxFunctionInvocationEvent) {
      vi.mocked(getSandboxFunctionInvocationEventsBatch).mockResolvedValue([
        { eventId: "event-1", data: event },
      ]);
      vi.mocked(getSandboxFunctionInvocationEvents).mockImplementation(
        async function* () {
          yield { eventId: "event-1", data: event };
        }
      );
    }

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("keeps an invocation streamable after the Frame republishes", async () => {
      const { frame, invocation, sandboxFunction, workspace } =
        await makeTestFrameInvocation();
      await frame.setActiveFramePublication({
        publicationId: "publication-2",
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
      const payload = suffix
        ? (await response.json()).events.join("\n")
        : await response.text();
      expect(payload).toContain('"result":{"ok":true}');
      expect(
        suffix
          ? getSandboxFunctionInvocationEventsBatch
          : getSandboxFunctionInvocationEvents
      ).toHaveBeenCalledWith({
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
      expect(
        suffix
          ? getSandboxFunctionInvocationEventsBatch
          : getSandboxFunctionInvocationEvents
      ).not.toHaveBeenCalled();
    });

    it("is available only behind frames_v2_functions", async () => {
      const { frame, invocation, workspace } = await makeTestFrameInvocation({
        enableFramesV2Functions: false,
      });

      const response = await getEvents({
        workspaceId: workspace.sId,
        frameId: frame.sId,
        invocationId: invocation.sId,
      });

      expect(response.status).toBe(403);
      expect(
        suffix
          ? getSandboxFunctionInvocationEventsBatch
          : getSandboxFunctionInvocationEvents
      ).not.toHaveBeenCalled();
    });
  }
);
