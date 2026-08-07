import {
  SANDBOX_TOKEN_PREFIX,
  verifySandboxExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import { isPollerChannelOpen } from "@app/lib/api/sandbox_functions/poller_channel";
import {
  createSandboxFunctionInvocationTokenTestContext,
  createSandboxPollerTokenTestContext,
} from "@app/tests/utils/SandboxTokenFactory";
import type { SandboxFunctionPollerEvent } from "@app/types/api/sandbox_functions";
import { honoApp } from "@front-api/app";
import { parseSseDataPayloads } from "@front-api/tests/utils/sse";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/api/sandbox_functions/poller_channel",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("@app/lib/api/sandbox_functions/poller_channel")
      >();
    return {
      ...mod,
      openPollerChannel: vi.fn(),
    };
  }
);

import { openPollerChannel } from "@app/lib/api/sandbox_functions/poller_channel";

function getPollerWork(workspace: { sId: string }, token: string) {
  return honoApp.request(`/api/sse/v1/w/${workspace.sId}/sandbox/poller/work`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/sse/v1/w/[wId]/sandbox/poller/work", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The channel's own behavior is covered where it lives; here it stands in so the route's
    // wiring, auth and rotation can be asserted without holding a stream open for a minute.
    vi.mocked(openPollerChannel).mockImplementation(async function* ({
      rotatedToken,
    }) {
      yield {
        eventId: "",
        data: {
          type: "sandbox_function_poller_token",
          created: 0,
          token: rotatedToken,
        },
      };
    });
  });

  it("streams the channel and hands the poller a rotated token", async () => {
    const { workspace, sandbox, token } =
      await createSandboxPollerTokenTestContext();

    const res = await getPollerWork(workspace, token);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    // Every streaming route emits the `{ eventId, data }` envelope, so the poller resumes from an
    // event id the same way every other client does.
    const payloads = parseSseDataPayloads(await res.text());
    const events: SandboxFunctionPollerEvent[] = payloads.map(
      (payload) => JSON.parse(payload).data
    );
    expect(events[0]?.type).toBe("sandbox_function_poller_token");

    expect(openPollerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: sandbox.sId, lastEventId: null })
    );
    // Rotation is the point: the token handed down must not be the one used to connect.
    const rotatedToken =
      events[0]?.type === "sandbox_function_poller_token"
        ? events[0].token
        : null;
    expect(rotatedToken).toEqual(expect.stringContaining(SANDBOX_TOKEN_PREFIX));
    expect(rotatedToken).not.toBe(token);
  });

  it("revokes the token that was used to connect", async () => {
    const { workspace, token } = await createSandboxPollerTokenTestContext();

    expect(await verifySandboxExecToken(token)).not.toBeNull();

    const res = await getPollerWork(workspace, token);
    await res.text();

    // Without this, rotation buys nothing: a leaked poller token would mint its own successor
    // every minute and stay good for the life of the sandbox.
    expect(await verifySandboxExecToken(token)).toBeNull();
  });

  it("resumes from the poller's last event id", async () => {
    const { workspace, token } = await createSandboxPollerTokenTestContext();

    const res = await honoApp.request(
      `/api/sse/v1/w/${workspace.sId}/sandbox/poller/work?lastEventId=12-0`,
      { method: "GET", headers: { authorization: `Bearer ${token}` } }
    );

    expect(res.status).toBe(200);
    await res.text();
    expect(openPollerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ lastEventId: "12-0" })
    );
  });

  it("rejects a function invocation token", async () => {
    const { workspace, token } =
      await createSandboxFunctionInvocationTokenTestContext();

    const res = await getPollerWork(workspace, token);

    expect(res.status).toBe(403);
    expect(openPollerChannel).not.toHaveBeenCalled();
  });

  it("rejects a request without a token", async () => {
    const { workspace } = await createSandboxPollerTokenTestContext();

    const res = await honoApp.request(
      `/api/sse/v1/w/${workspace.sId}/sandbox/poller/work`,
      { method: "GET" }
    );

    expect(res.status).toBe(401);
    expect(openPollerChannel).not.toHaveBeenCalled();
  });

  it("leaves the pod unreachable when nothing is connected", async () => {
    const { sandbox } = await createSandboxPollerTokenTestContext();

    expect(await isPollerChannelOpen({ sandboxId: sandbox.sId })).toBe(false);
  });
});
