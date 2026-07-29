import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { markSandboxFunctionInvocationFailedActivity } from "@app/temporal/sandbox_functions/activities/mark_sandbox_function_invocation_failed";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
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

  return { authenticator, sandboxFunction, invocation };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markSandboxFunctionInvocationFailedActivity", () => {
  it("marks a created invocation as errored without loading its blob", async () => {
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
});
