import {
  createSandboxFunctionInvocationTokenTestContext,
  createSandboxTokenTestContext,
} from "@app/tests/utils/SandboxTokenFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/functions/events", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@app/lib/api/sandbox/functions/events")
    >();
  return {
    ...mod,
    publishSandboxFunctionInvocationEvent: vi.fn(),
  };
});

import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox/functions/events";

function postSandboxFunctionResult(
  workspace: { sId: string },
  token: string,
  body: unknown
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/sandbox/sandbox-functions/result`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/v1/w/[wId]/sandbox/sandbox-functions/result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success for sandbox function invocation result callbacks", async () => {
    const { sandbox, token, workspace } =
      await createSandboxFunctionInvocationTokenTestContext();
    const invocationId = `test-invocation-${sandbox.sId}`;

    const response = await postSandboxFunctionResult(workspace, token, {
      function: "test_function",
      result: { hello: "world" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      {
        type: "sandbox_function_invocation_result",
        created: expect.any(Number),
        invocationId,
        functionId: "sfn_test",
        result: { hello: "world" },
      },
      { invocationId }
    );
  });

  it("keeps accepting callbacks without a function name", async () => {
    const { token, workspace } =
      await createSandboxFunctionInvocationTokenTestContext();

    const response = await postSandboxFunctionResult(workspace, token, {
      result: { hello: "world" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("rejects sandbox action tokens", async () => {
    const { token, workspace } = await createSandboxTokenTestContext();

    const response = await postSandboxFunctionResult(workspace, token, {
      function: "test_function",
      result: { hello: "world" },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "This sandbox token cannot access sandbox function invocations.",
      },
    });
    expect(publishSandboxFunctionInvocationEvent).not.toHaveBeenCalled();
  });
});
