import { SandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
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

import { launchSandboxFunctionInvocationWorkflow } from "@app/temporal/sandbox_functions/client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/w/:wId/frames/:frameId/functions/:name/invocations", () => {
  it("invokes the named function from the active publication", async () => {
    const { workspace, frame, sandboxFunction } = await makeTestFrameFunction();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/functions/run-function/invocations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { message: "hello" } }),
      }
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      invocation: {
        functionId: sandboxFunction.sId,
        status: "created",
      },
    });
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sandboxFunction: expect.objectContaining({
          sId: sandboxFunction.sId,
          publicationId: "publication-1",
        }),
      })
    );
  });

  it("reports an unavailable Frame runtime as a state conflict", async () => {
    const { workspace, frame } = await makeTestFrameFunction();
    vi.spyOn(SandboxFunctionResource.prototype, "invoke").mockResolvedValueOnce(
      new Err(
        new SandboxFunctionInvocationError(
          "This Frame's runtime scope no longer exists.",
          "frame_runtime_unavailable"
        )
      )
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/frames/${frame.sId}/functions/run-function/invocations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { type: "frame_runtime_unavailable" },
    });
  });
});
