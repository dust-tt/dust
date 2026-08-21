import { SandboxExecTimeoutError } from "@app/lib/api/sandbox/provider";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { runSandboxFunctionInvocationActivity } from "@app/temporal/sandbox_functions/activities/run_sandbox_function_invocation";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  const { authenticator: adminAuth, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const file = await FileFactory.create(adminAuth, null, {
    contentType: sandboxFunctionContentType,
    fileName: "function.ts",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });
  const sandboxFunction = await SandboxFunctionResource.makeNew(adminAuth, {
    space,
    file,
    slug: "run-function",
    description: "Run the function.",
    inputSchema: schema,
    outputSchema: schema,
  });
  const member = await UserFactory.basic();
  await MembershipFactory.associate(workspace, member, { role: "user" });
  const addMemberResult = await space.addMembers(adminAuth, {
    userIds: [member.sId],
  });
  if (addMemberResult.isErr()) {
    throw addMemberResult.error;
  }
  const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
    member.sId,
    workspace.sId
  );
  const userlessAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const invocation = await SandboxFunctionInvocationResource.makeNew(
    userlessAuth,
    { sandboxFunction, input: { message: "hello" } }
  );

  return { adminAuth, authenticator, sandboxFunction, invocation };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runSandboxFunctionInvocationActivity", () => {
  it("executes the existing invocation", async () => {
    const { authenticator, sandboxFunction, invocation } = await setup();
    await expect(
      SandboxFunctionInvocationResource.fetchById(authenticator, {
        sandboxFunction,
        invocationId: invocation.sId,
      })
    ).resolves.toBeNull();
    const executeSpy = vi
      .spyOn(SandboxFunctionInvocationResource.prototype, "execute")
      .mockImplementation(async function (
        this: SandboxFunctionInvocationResource
      ) {
        expect(this.input).toEqual({ message: "hello" });
        return new Ok(undefined);
      });

    await runSandboxFunctionInvocationActivity(authenticator.toJSON(), {
      sandboxFunctionId: sandboxFunction.sId,
      invocationId: invocation.sId,
    });

    expect(executeSpy).toHaveBeenCalledWith(expect.anything());
  });

  it("fails the invocation when execution fails", async () => {
    const { adminAuth, authenticator, sandboxFunction, invocation } =
      await setup();
    vi.spyOn(
      SandboxFunctionInvocationResource.prototype,
      "execute"
    ).mockResolvedValue(new Err(new Error("sandbox unavailable")));

    await expect(
      runSandboxFunctionInvocationActivity(authenticator.toJSON(), {
        sandboxFunctionId: sandboxFunction.sId,
        invocationId: invocation.sId,
      })
    ).rejects.toThrow("sandbox unavailable");

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      adminAuth,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("errored");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sandbox_function_invocation_error",
        invocationId: invocation.sId,
        error: { code: "invocation_failed", message: "sandbox unavailable" },
      }),
      { invocationId: invocation.sId }
    );
  });

  it("fails the invocation without throwing when execution times out", async () => {
    const { adminAuth, authenticator, sandboxFunction, invocation } =
      await setup();
    const timeoutError = new SandboxExecTimeoutError(120_000);
    vi.spyOn(
      SandboxFunctionInvocationResource.prototype,
      "execute"
    ).mockResolvedValue(new Err(timeoutError));

    await expect(
      runSandboxFunctionInvocationActivity(authenticator.toJSON(), {
        sandboxFunctionId: sandboxFunction.sId,
        invocationId: invocation.sId,
      })
    ).resolves.toBeUndefined();

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      adminAuth,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("errored");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sandbox_function_invocation_error",
        invocationId: invocation.sId,
        error: {
          code: "invocation_failed",
          message: timeoutError.message,
        },
      }),
      { invocationId: invocation.sId }
    );
  });
});
