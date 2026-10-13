import { SandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { makeTestPublicFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { PUBLIC_FRAME_INVOCATION_TOKEN_HEADER } from "@app/types/api/sandbox_functions";
import { Err, Ok } from "@app/types/shared/result";
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
    getSandboxFunctionInvocationEventsBatch: vi.fn(async () => []),
  };
});

vi.mock("@app/temporal/sandbox_functions/client", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@app/temporal/sandbox_functions/client")
    >();
  return {
    ...mod,
    launchSandboxFunctionInvocationWorkflow: vi.fn(
      async () => new Ok(undefined)
    ),
  };
});

import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";

beforeEach(() => {
  vi.clearAllMocks();
});

function invoke(token: string, name: string) {
  return honoApp.request(
    `/api/v1/public/frames/${token}/functions/${name}/invocations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: {} }),
    }
  );
}

describe("POST /api/v1/public/frames/:token/functions/:name/invocations", () => {
  it("hands back a result token for an invocation that escalates to the workflow", async () => {
    const { sandboxFunction, token } = await makeTestPublicFrameFunction();

    const response = await invoke(token, "list-todos");

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      invocation: { functionId: sandboxFunction.sId, status: "created" },
      resultToken: expect.any(String),
    });

    const pollUrl = `/api/sse/v1/public/frames/${token}/invocations/${body.invocation.sId}/events/poll`;
    const poll = await honoApp.request(pollUrl, {
      headers: { [PUBLIC_FRAME_INVOCATION_TOKEN_HEADER]: body.resultToken },
    });
    expect(poll.status).toBe(200);

    const forged = await honoApp.request(pollUrl, {
      headers: { [PUBLIC_FRAME_INVOCATION_TOKEN_HEADER]: "forged" },
    });
    expect(forged.status).toBe(404);

    const missing = await honoApp.request(pollUrl);
    expect(missing.status).toBe(404);
  });

  it("replaces the message of a failed call and keeps its code", async () => {
    const { sandboxFunction, token } = await makeTestPublicFrameFunction();
    vi.mocked(getSandboxFunctionInvocationEvents).mockImplementationOnce(
      async function* () {
        yield {
          eventId: "1-0",
          data: {
            type: "sandbox_function_invocation_error",
            created: Date.now(),
            invocationId: "inv",
            functionId: sandboxFunction.sId,
            error: { code: "threw", message: "db password is hunter2" },
          },
        };
      }
    );

    const response = await invoke(token, "list-todos");

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      outcome: {
        status: "errored",
        error: { code: "threw", message: "The Frame function failed." },
      },
    });
  });

  it("replaces the message of an invocation error and keeps its code", async () => {
    const { token } = await makeTestPublicFrameFunction();
    vi.spyOn(SandboxFunctionResource.prototype, "invoke").mockResolvedValueOnce(
      new Err(
        new SandboxFunctionInvocationError(
          "Sandbox sbx_123 of space spc_456 is gone.",
          "frame_runtime_unavailable"
        )
      )
    );

    const response = await invoke(token, "list-todos");

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        type: "frame_runtime_unavailable",
        message: "The Frame function failed.",
      },
    });
  });

  it("refuses a private function with a typed 401", async () => {
    const { token } = await makeTestPublicFrameFunction({
      userIdentity: "workspace_user_required",
    });

    const response = await invoke(token, "list-todos");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { type: "user_authentication_required" },
    });
  });

  it("returns 404 for a function the publication does not declare", async () => {
    const { token } = await makeTestPublicFrameFunction();

    const response = await invoke(token, "unknown-function");

    expect(response.status).toBe(404);
  });

  it("returns 404 for a Frame shared with the workspace only", async () => {
    const { token } = await makeTestPublicFrameFunction({
      shareScope: "workspace_and_emails",
    });

    const response = await invoke(token, "list-todos");

    expect(response.status).toBe(404);
  });

  it("returns 404 when public functions are disabled", async () => {
    const { token } = await makeTestPublicFrameFunction({
      enablePublicFunctions: false,
    });

    const response = await invoke(token, "list-todos");

    expect(response.status).toBe(404);
  });
});
