import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { launchSandboxFunctionInvocationWorkflow } from "@app/temporal/sandbox_functions/client";
import {
  createTestFrameFunction,
  createTestFrameSessionCookie,
  makeTestPublicFrameFunction,
} from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { resolveOptionalAuth } from "@front-api/routes/v1/public/frames/shared_auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@front-api/routes/v1/public/frames/shared_auth", () => ({
  resolveOptionalAuth: vi.fn().mockResolvedValue(null),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOptionalAuth).mockResolvedValue(null);
});

function invoke(token: string, name: string, cookie?: string) {
  return honoApp.request(
    `/api/v1/public/frames/${token}/functions/${name}/invocations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({ input: {} }),
    }
  );
}

describe("POST /api/v1/public/frames/:token/functions/:name/invocations", () => {
  it("starts an anonymous invocation for a viewer verified by email", async () => {
    const { authenticator, sandboxFunction, token, workspace } =
      await makeTestPublicFrameFunction();

    const response = await invoke(
      token,
      "list-todos",
      await createTestFrameSessionCookie(workspace)
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      invocation: { functionId: sandboxFunction.sId, status: "created" },
    });
    const invocation = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: body.invocation.sId, access: "admin" }
    );
    expect(invocation?.origin).toBe("external_session");
    expect(invocation?.userId).toBeNull();
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        invocation: expect.objectContaining({ sId: body.invocation.sId }),
      })
    );
  });

  it("starts the invocation as the signed-in workspace member", async () => {
    const { authenticator, sandboxFunction, token } =
      await makeTestPublicFrameFunction();
    vi.mocked(resolveOptionalAuth).mockResolvedValue(authenticator);

    const response = await invoke(token, "list-todos");

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      invocation: { functionId: sandboxFunction.sId, status: "created" },
    });
    const invocation = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      {
        sandboxFunction,
        invocationId: body.invocation.sId,
        access: "admin",
      }
    );
    expect(invocation?.origin).toBe("delegated");
    expect(invocation?.userId).toBe(authenticator.user()?.id);
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        invocation: expect.objectContaining({ sId: body.invocation.sId }),
      })
    );
  });

  it("refuses a viewer without a verified email", async () => {
    const { token } = await makeTestPublicFrameFunction();

    const response = await invoke(token, "list-todos");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { type: "user_authentication_required" },
    });
  });

  it("refuses an email verified in another workspace", async () => {
    const { token } = await makeTestPublicFrameFunction();
    const { workspace: otherWorkspace } = await createResourceTest({
      role: "admin",
    });

    const response = await invoke(
      token,
      "list-todos",
      await createTestFrameSessionCookie(otherWorkspace)
    );

    expect(response.status).toBe(401);
  });

  it("refuses a function that is not public", async () => {
    const { token, workspace } = await makeTestPublicFrameFunction({
      userIdentity: "workspace_user_required",
    });

    const response = await invoke(
      token,
      "list-todos",
      await createTestFrameSessionCookie(workspace)
    );

    expect(response.status).toBe(401);
  });

  it("refuses a Frame shared with the workspace only", async () => {
    const { token, workspace } = await makeTestPublicFrameFunction({
      shareScope: "workspace_and_emails",
    });

    const response = await invoke(
      token,
      "list-todos",
      await createTestFrameSessionCookie(workspace)
    );

    expect(response.status).toBe(401);
  });

  it("refuses when public functions are disabled", async () => {
    const { token, workspace } = await makeTestPublicFrameFunction({
      enablePublicFunctions: false,
    });

    const response = await invoke(
      token,
      "list-todos",
      await createTestFrameSessionCookie(workspace)
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 for a function of another Frame", async () => {
    const { authenticator, token, workspace } =
      await makeTestPublicFrameFunction();
    await createTestFrameFunction(authenticator, {
      space: await SpaceFactory.project(workspace),
      slug: "other-frame-function",
      userIdentity: "public",
      executionMode: "fast",
    });

    const response = await invoke(
      token,
      "other-frame-function",
      await createTestFrameSessionCookie(workspace)
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown share token", async () => {
    const { workspace } = await makeTestPublicFrameFunction();

    const response = await invoke(
      "unknown-token",
      "list-todos",
      await createTestFrameSessionCookie(workspace)
    );

    expect(response.status).toBe(404);
  });
});
