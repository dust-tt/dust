import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { markSandboxFunctionInvocationFailedActivity } from "@app/temporal/sandbox_functions/activities/mark_sandbox_function_invocation_failed";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox_functions/events", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/events")
    >();
  return {
    ...actual,
    publishSandboxFunctionInvocationEvent: vi.fn(),
  };
});

const schema: JSONSchema = { type: "object" };

async function setup() {
  const { authenticator, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const file = await FileFactory.create(authenticator, null, {
    contentType: sandboxFunctionContentType,
    fileName: "function.ts",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });
  const sandboxFunction = await SandboxFunctionResource.makeNew(authenticator, {
    space,
    file,
    slug: "run-function",
    description: "Run the function.",
    inputSchema: schema,
    outputSchema: schema,
  });
  const invocation = await SandboxFunctionInvocationResource.makeNew(
    authenticator,
    { sandboxFunction, input: { message: "hello" } }
  );

  return { authenticator, workspace, sandboxFunction, invocation };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markSandboxFunctionInvocationFailedActivity", () => {
  it("marks a created invocation as errored after fetching its resources", async () => {
    const { authenticator, sandboxFunction, invocation } = await setup();

    await markSandboxFunctionInvocationFailedActivity(authenticator.toJSON(), {
      errorMessage: "The worker could not parse the invocation.",
      sandboxFunctionId: sandboxFunction.sId,
      invocationId: invocation.sId,
    });

    expect(invocation.status).toBe("created");
    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("errored");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sandbox_function_invocation_error",
        invocationId: invocation.sId,
        error: {
          code: "invocation_failed",
          message: "The worker could not parse the invocation.",
        },
      }),
      { invocationId: invocation.sId }
    );
  });

  it("marks a userless invocation as errored", async () => {
    const { authenticator, workspace, sandboxFunction } = await setup();
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const userlessInvocation = await SandboxFunctionInvocationResource.makeNew(
      userlessAuth,
      {
        sandboxFunction,
        input: { message: "hello" },
      }
    );
    expect(userlessInvocation.userId).toBeNull();

    await markSandboxFunctionInvocationFailedActivity(userlessAuth.toJSON(), {
      errorMessage: "The worker died before returning a result.",
      sandboxFunctionId: sandboxFunction.sId,
      invocationId: userlessInvocation.sId,
    });

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: userlessInvocation.sId }
    );
    expect(refetched?.status).toBe("errored");
  });

  it("does not overwrite an invocation that already succeeded", async () => {
    const { authenticator, sandboxFunction, invocation } = await setup();
    await invocation.succeed({ ok: true });
    vi.clearAllMocks();

    await markSandboxFunctionInvocationFailedActivity(authenticator.toJSON(), {
      errorMessage: "Late workflow failure.",
      sandboxFunctionId: sandboxFunction.sId,
      invocationId: invocation.sId,
    });

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("succeeded");
    expect(publishSandboxFunctionInvocationEvent).not.toHaveBeenCalled();
  });

  it("updates an invocation for a workspace member without pod access", async () => {
    // Execution-side resolution: the serialized auth may belong to an invoker whose original grant
    // (e.g. a frame share token) cannot be reconstructed; the invocation row is the proof of
    // authorization, so pod access is deliberately not re-checked here.
    const { authenticator, workspace, sandboxFunction, invocation } =
      await setup();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(userAuth).not.toBeNull();
    if (!userAuth) {
      return;
    }

    await markSandboxFunctionInvocationFailedActivity(userAuth.toJSON(), {
      errorMessage: "Late workflow failure.",
      sandboxFunctionId: sandboxFunction.sId,
      invocationId: invocation.sId,
    });

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("errored");
  });

  it("does not update an invocation from another workspace", async () => {
    const { authenticator, sandboxFunction, invocation } = await setup();
    const otherCtx = await createResourceTest({ role: "admin" });

    await expect(
      markSandboxFunctionInvocationFailedActivity(
        otherCtx.authenticator.toJSON(),
        {
          errorMessage: "Late workflow failure.",
          sandboxFunctionId: sandboxFunction.sId,
          invocationId: invocation.sId,
        }
      )
    ).rejects.toThrow(`Pod function not found: ${sandboxFunction.sId}`);

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("created");
    expect(publishSandboxFunctionInvocationEvent).not.toHaveBeenCalled();
  });
});
