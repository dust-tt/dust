import { generateSandboxFunctionInvocationToken } from "@app/lib/api/sandbox/access_tokens";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensurePodSandboxReady: vi.fn(),
}));

vi.mock("@app/lib/api/sandbox/access_tokens", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/sandbox/access_tokens")>();

  return {
    ...actual,
    generateSandboxFunctionInvocationToken: vi.fn(),
  };
});

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

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: {
    commentId: { type: "string" },
  },
  required: ["commentId"],
};

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

async function setupExecutionTest() {
  const { authenticator, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const file = await FileFactory.create(authenticator, null, {
    contentType: sandboxFunctionContentType,
    fileName: "comments.ts",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });
  const sandboxFunction = await SandboxFunctionResource.makeNew(authenticator, {
    space,
    file,
    slug: "add-comment",
    description: "Add a comment.",
    inputSchema,
    outputSchema,
  });
  const sandbox = await SandboxResource.makeNew(authenticator, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  vi.mocked(ensurePodSandboxReady).mockResolvedValue(
    new Ok({ sandbox, freshlyCreated: false })
  );
  vi.mocked(generateSandboxFunctionInvocationToken).mockResolvedValue(
    "sbt-function-token"
  );
  const invocation = await SandboxFunctionInvocationResource.makeNew(
    authenticator,
    { sandboxFunction, input: { message: "hello" } }
  );

  return {
    authenticator,
    space,
    sandboxFunction,
    sandbox,
    invocation,
  };
}

describe("SandboxFunctionInvocationResource", () => {
  it("stores and reloads its input from GCS", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    expect(invocation.gcsPath).toBe(
      `w/${authenticator.getNonNullableWorkspace().sId}/sandbox_functions/${sandboxFunction.sId}/invocations/${invocation.sId}`
    );
    expect(invocation.input).toEqual({ message: "hello" });
    expect(invocation.result).toBeUndefined();
    expect(invocation.error).toBeUndefined();
    expect(fileStorageMock.getObject(invocation.gcsPath!)).toBe(
      JSON.stringify({ version: 1, input: { message: "hello" } })
    );

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.input).toEqual({ message: "hello" });
  });

  it("rejects unsupported stored data versions", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    await getPrivateUploadBucket()
      .file(invocation.gcsPath!)
      .save(Buffer.from(JSON.stringify({ version: 2 }), "utf-8"));

    await expect(
      SandboxFunctionInvocationResource.fetchById(authenticator, {
        sandboxFunction,
        invocationId: invocation.sId,
      })
    ).rejects.toThrow("Invalid sandbox function invocation data");
  });

  it("stores and reloads its result from GCS on success", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();
    const result = { commentId: "comment-123" };

    await invocation.succeed(result);

    expect(invocation.status).toBe("succeeded");
    expect(invocation.result).toEqual(result);
    expect(invocation.error).toBeUndefined();
    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.result).toEqual(result);
    expect(refetched?.error).toBeUndefined();
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sandbox_function_invocation_result",
        invocationId: invocation.sId,
        result,
      }),
      { invocationId: invocation.sId }
    );
  });

  it("stores and reloads its error from GCS on failure", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    await invocation.fail(new Error("sandbox unavailable"));

    expect(invocation.status).toBe("errored");
    expect(invocation.result).toBeUndefined();
    expect(invocation.error).toBe("sandbox unavailable");
    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.result).toBeUndefined();
    expect(refetched?.error).toBe("sandbox unavailable");
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sandbox_function_invocation_error",
        invocationId: invocation.sId,
        message: "sandbox unavailable",
      }),
      { invocationId: invocation.sId }
    );
  });

  it("executes an invocation on the pod sandbox", async () => {
    const { authenticator, space, sandboxFunction, sandbox, invocation } =
      await setupExecutionTest();
    const updateLastActivityAtSpy = vi.spyOn(sandbox, "updateLastActivityAt");
    const execSpy = vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: "hello world\n",
        stderr: "",
      })
    );

    expect(invocation.toJSON()).toMatchObject({
      functionId: sandboxFunction.sId,
      status: "created",
    });
    expect(invocation.sId).toMatch(/^sfi_/);
    expect(Date.parse(invocation.toJSON().createdAt)).not.toBeNaN();

    const executionResult = await invocation.execute(authenticator);
    if (executionResult.isErr()) {
      throw executionResult.error;
    }

    const refetchedInvocation =
      await SandboxFunctionInvocationResource.fetchById(authenticator, {
        sandboxFunction,
        invocationId: invocation.sId,
      });
    expect(refetchedInvocation?.status).toBe("created");
    expect(updateLastActivityAtSpy).toHaveBeenCalledOnce();
    expect(ensurePodSandboxReady).toHaveBeenCalledWith(authenticator, space);
    expect(generateSandboxFunctionInvocationToken).toHaveBeenCalledWith(
      authenticator,
      {
        sandbox,
        sandboxFunction,
        invocationId: invocation.sId,
        execId: expect.any(String),
      }
    );
    expect(execSpy).toHaveBeenCalledTimes(1);

    const execCall = execSpy.mock.calls[0];
    expect(execCall).toBeDefined();
    if (!execCall) {
      return;
    }
    const [, command, opts] = execCall;
    // The bundle is read from the read-only mount, so the command is just the run, no staging write.
    expect(command).toBe("/opt/bin/dsbx function run 'add-comment'");
    expect(opts?.envVars).toMatchObject({
      DUST_FUNCTIONS_DIR: `/sandbox-functions/pods/${space.sId}`,
      DUST_POD_DATABASES_DIR: "/pod-state/databases",
      DUST_POD_DATABASE_MAX_SIZE_BYTES: "1073741824",
      DUST_SANDBOX_TOKEN: "sbt-function-token",
    });
    expect(opts?.user).toBe("agent-proxied");
    expect(opts?.workingDirectory).toBe("/home/agent");
    expect(typeof opts?.stdin).toBe("string");
    if (typeof opts?.stdin !== "string") {
      return;
    }
    const inputEnvelope = JSON.parse(opts.stdin);
    expect(inputEnvelope).toMatchObject({
      method: "POST",
      url: `https://dust.local/sandbox-functions/${sandboxFunction.sId}/invocations/${invocation.sId}`,
      headers: {
        "content-type": "application/json",
        "x-dust-sandbox-function-id": sandboxFunction.sId,
        "x-dust-sandbox-function-invocation-id": invocation.sId,
      },
      body: JSON.stringify({ message: "hello" }),
      encoding: "utf8",
    });
  });

  it("surfaces the runner stderr when the invocation exits non-zero", async () => {
    const { authenticator, sandbox, invocation } = await setupExecutionTest();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 1,
        stdout: "some stdout",
        stderr: "dsbx command failed: connection refused",
      })
    );

    const result = await invocation.execute(authenticator);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.message).toContain("exit code 1");
    expect(result.error.message).toContain(
      "dsbx command failed: connection refused"
    );
  });

  it("falls back to the runner stdout when stderr is empty on failure", async () => {
    const { authenticator, sandbox, invocation } = await setupExecutionTest();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 2,
        stdout: "boom from stdout",
        stderr: "",
      })
    );

    const result = await invocation.execute(authenticator);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.message).toContain("exit code 2");
    expect(result.error.message).toContain("boom from stdout");
  });
});
