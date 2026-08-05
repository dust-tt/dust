import { generateSandboxFunctionInvocationToken } from "@app/lib/api/sandbox/access_tokens";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import {
  createPersistedSandboxFunctionInvocationTokenTestContext,
  createSandboxTokenTestContext,
} from "@app/tests/utils/SandboxTokenFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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
  };
});

import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";

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
    const { auth, workspace, sandbox, podSpace, sandboxFunction } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();
    const callbackUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, callbackUser, {
      role: "user",
    });
    const addMemberResult = await podSpace.addMembers(auth, {
      userIds: [callbackUser.sId],
    });
    expect(addMemberResult.isOk()).toBe(true);
    const callbackAuth = await Authenticator.fromUserIdAndWorkspaceId(
      callbackUser.sId,
      workspace.sId
    );
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const invocation = await SandboxFunctionInvocationResource.makeNew(
      userlessAuth,
      { sandboxFunction, input: undefined }
    );
    await expect(
      SandboxFunctionInvocationResource.fetchById(callbackAuth, {
        sandboxFunction,
        invocationId: invocation.sId,
      })
    ).resolves.toBeNull();
    const token = await generateSandboxFunctionInvocationToken(callbackAuth, {
      sandbox,
      sandboxFunction,
      invocationId: invocation.sId,
      execId: `test-function-exec-${sandbox.sId}`,
    });

    const response = await postSandboxFunctionResult(workspace, token, {
      function: "test_function",
      result: { ok: true, output: { hello: "world" } },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const refetchedInvocation =
      await SandboxFunctionInvocationResource.fetchById(auth, {
        sandboxFunction,
        invocationId: invocation.sId,
      });
    expect(refetchedInvocation?.status).toBe("succeeded");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      {
        type: "sandbox_function_invocation_result",
        created: expect.any(Number),
        invocationId: invocation.sId,
        functionId: sandboxFunction.sId,
        result: { hello: "world" },
      },
      { invocationId: invocation.sId }
    );
  });

  it("keeps accepting callbacks without a function name", async () => {
    const { token, workspace } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();

    const response = await postSandboxFunctionResult(workspace, token, {
      result: { ok: true, output: { hello: "world" } },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("publishes structured runner errors as invocation errors", async () => {
    const { auth, token, workspace, sandboxFunction, invocation } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();

    const response = await postSandboxFunctionResult(workspace, token, {
      result: {
        ok: false,
        error: {
          code: "invalid_output",
          message: "Function output does not match schema.output.",
        },
      },
    });

    expect(response.status).toBe(200);
    const refetchedInvocation =
      await SandboxFunctionInvocationResource.fetchById(auth, {
        sandboxFunction,
        invocationId: invocation.sId,
      });
    expect(refetchedInvocation?.status).toBe("errored");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      {
        type: "sandbox_function_invocation_error",
        created: expect.any(Number),
        invocationId: invocation.sId,
        functionId: sandboxFunction.sId,
        error: {
          code: "invalid_output",
          message: "Function output does not match schema.output.",
        },
      },
      { invocationId: invocation.sId }
    );
  });

  it("normalizes successful callbacks from the previous runner image", async () => {
    const { auth, token, workspace, sandboxFunction, invocation } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();

    const response = await postSandboxFunctionResult(workspace, token, {
      result: {
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          body: Buffer.from(JSON.stringify({ hello: "legacy" })).toString(
            "base64"
          ),
          encoding: "base64",
        },
      },
    });

    expect(response.status).toBe(200);
    const refetchedInvocation =
      await SandboxFunctionInvocationResource.fetchById(auth, {
        sandboxFunction,
        invocationId: invocation.sId,
      });
    expect(refetchedInvocation?.status).toBe("succeeded");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      {
        type: "sandbox_function_invocation_result",
        created: expect.any(Number),
        invocationId: invocation.sId,
        functionId: sandboxFunction.sId,
        result: { hello: "legacy" },
      },
      { invocationId: invocation.sId }
    );
  });

  it("fails the invocation when the runner callback is malformed", async () => {
    const { auth, token, workspace, sandboxFunction, invocation } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();

    const response = await postSandboxFunctionResult(workspace, token, {
      result: { ok: true },
    });

    expect(response.status).toBe(200);
    const refetchedInvocation =
      await SandboxFunctionInvocationResource.fetchById(auth, {
        sandboxFunction,
        invocationId: invocation.sId,
      });
    expect(refetchedInvocation?.status).toBe("errored");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      {
        type: "sandbox_function_invocation_error",
        created: expect.any(Number),
        invocationId: invocation.sId,
        functionId: sandboxFunction.sId,
        error: {
          code: "invocation_failed",
          message: "Sandbox function returned an invalid result envelope.",
        },
      },
      { invocationId: invocation.sId }
    );
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
        message: "This sandbox token cannot access this endpoint.",
      },
    });
    expect(publishSandboxFunctionInvocationEvent).not.toHaveBeenCalled();
  });

  it("accepts protocol v3 success envelopes", async () => {
    const { auth, token, workspace, sandboxFunction, invocation } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();

    const response = await postSandboxFunctionResult(workspace, token, {
      result: {
        protocolVersion: 3,
        delivery: "callback",
        outcome: { ok: true, output: { hello: "v3" } },
        timingsMs: { total: 10, runner: 4 },
      },
    });

    expect(response.status).toBe(200);
    const refetchedInvocation =
      await SandboxFunctionInvocationResource.fetchById(auth, {
        sandboxFunction,
        invocationId: invocation.sId,
      });
    expect(refetchedInvocation?.status).toBe("succeeded");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      {
        type: "sandbox_function_invocation_result",
        created: expect.any(Number),
        invocationId: invocation.sId,
        functionId: sandboxFunction.sId,
        result: { hello: "v3" },
      },
      { invocationId: invocation.sId }
    );
  });

  it("publishes protocol v3 runner errors as invocation errors", async () => {
    const { auth, token, workspace, sandboxFunction, invocation } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();

    const response = await postSandboxFunctionResult(workspace, token, {
      result: {
        protocolVersion: 3,
        delivery: "stdout",
        outcome: {
          ok: false,
          error: {
            code: "threw",
            message: "boom",
          },
        },
      },
    });

    expect(response.status).toBe(200);
    const refetchedInvocation =
      await SandboxFunctionInvocationResource.fetchById(auth, {
        sandboxFunction,
        invocationId: invocation.sId,
      });
    expect(refetchedInvocation?.status).toBe("errored");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      {
        type: "sandbox_function_invocation_error",
        created: expect.any(Number),
        invocationId: invocation.sId,
        functionId: sandboxFunction.sId,
        error: {
          code: "threw",
          message: "boom",
        },
      },
      { invocationId: invocation.sId }
    );
  });

  it("treats a second callback for an already-succeeded invocation as a no-op", async () => {
    const { auth, token, workspace, sandboxFunction, invocation } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();

    const first = await postSandboxFunctionResult(workspace, token, {
      result: { ok: true, output: { hello: "first" } },
    });
    expect(first.status).toBe(200);

    const second = await postSandboxFunctionResult(workspace, token, {
      result: { ok: true, output: { hello: "second" } },
    });
    expect(second.status).toBe(200);

    const refetchedInvocation =
      await SandboxFunctionInvocationResource.fetchById(auth, {
        sandboxFunction,
        invocationId: invocation.sId,
      });
    expect(refetchedInvocation?.status).toBe("succeeded");
    expect(refetchedInvocation?.result).toEqual({ hello: "first" });
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledTimes(1);
  });
});
