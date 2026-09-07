import { formatSandboxFunctionInvocations } from "@app/lib/api/actions/servers/sandbox_functions/tools/inspect_invocations";
import { generateSandboxFunctionInvocationToken } from "@app/lib/api/sandbox/access_tokens";
import { SandboxNotRunningError } from "@app/lib/api/sandbox/errors";
import {
  ensureFrameSandboxReady,
  ensurePodSandboxReady,
} from "@app/lib/api/sandbox/lifecycle";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import type {
  NormalizedSandboxFunctionOutcome,
  SandboxFunctionResultSpillPointer,
} from "@app/lib/api/sandbox_functions/result_envelope";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchSandboxFunctionInvocationWorkflow } from "@app/temporal/sandbox_functions/client";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionInvocationOrigin,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import {
  frameV2ContentType,
  sandboxFunctionContentType,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tracerMocks = vi.hoisted(() => {
  const setTag = vi.fn();
  return {
    setTag,
    trace: vi.fn(
      (
        _name: string,
        optionsOrCallback: unknown,
        maybeCallback?: (span: { setTag: typeof setTag }) => unknown
      ) => {
        const callback =
          typeof optionsOrCallback === "function"
            ? optionsOrCallback
            : maybeCallback;
        return callback?.({ setTag });
      }
    ),
  };
});

vi.mock("@app/logger/tracer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/logger/tracer")>();
  return {
    default: new Proxy(actual.default, {
      get(target, property) {
        if (property === "trace") {
          return tracerMocks.trace;
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  };
});

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensureFrameSandboxReady: vi.fn(),
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

// Stamped on the function at creation and expected back on every exec envelope.
const TEST_BUNDLE_SHA256 = "a".repeat(64);

// dsbx always delivers the result on the exec's own stdout, as a protocol v3 envelope. The
// outcome is either inline or, for an oversized result, a spill pointer to a sandbox file.
function stdoutEnvelope(
  outcome: NormalizedSandboxFunctionOutcome | SandboxFunctionResultSpillPointer
): string {
  return (
    JSON.stringify({ protocolVersion: 3, delivery: "stdout", outcome }) + "\n"
  );
}

const SUCCEEDED_STDOUT = stdoutEnvelope({
  ok: true,
  output: { commentId: "comment-1" },
});

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

async function setupExecutionTest(
  userIdentity: SandboxFunctionUserIdentityPolicy = "optional",
  origin: SandboxFunctionInvocationOrigin = "delegated",
  executionMode: SandboxFunctionExecutionMode = "durable",
  slug: string = "add-comment"
) {
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
    slug,
    description: "Add a comment.",
    userIdentity,
    executionMode,
    bundleSha256: TEST_BUNDLE_SHA256,
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
    { sandboxFunction, input: { message: "hello" }, origin }
  );

  return {
    authenticator,
    workspace,
    space,
    sandboxFunction,
    sandbox,
    invocation,
  };
}

async function setupFrameExecutionTest({
  standalone = false,
}: {
  standalone?: boolean;
} = {}) {
  const { authenticator, globalSpace, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const conversation = standalone
    ? await ConversationFactory.create(authenticator, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
      })
    : null;
  const publicationId = "publication-1";
  const frame = await FileFactory.create(authenticator, null, {
    contentType: frameV2ContentType,
    fileName: "tasks.frame.json",
    fileSize: 100,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: {
      ...(conversation
        ? { conversationId: conversation.sId }
        : { spaceId: space.sId }),
      activePublicationId: publicationId,
    },
  });
  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      authenticator,
      {
        frame,
        publicationId,
        functions: [
          {
            name: "add-task",
            description: "Add a task.",
            userIdentity: "optional",
            executionMode: "durable",
            defaultStake: "low",
            bundleCode: "export default () => 'ok';",
            inputSchema,
            outputSchema,
          },
        ],
      },
      transaction
    )
  );
  const sandboxFunction =
    await SandboxFunctionResource.fetchByFramePublicationAndSlug(
      authenticator,
      { frame, publicationId, slug: "add-task" }
    );
  if (!sandboxFunction) {
    throw new Error("Expected the Frame function to exist.");
  }
  const sandbox = await SandboxResource.makeNew(authenticator, {
    providerId: "test-frame-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
    new Ok({
      sandbox,
      freshlyCreated: false,
      scope: { spaceId: standalone ? null : space.sId },
    })
  );
  vi.mocked(generateSandboxFunctionInvocationToken).mockResolvedValue(
    "sbt-frame-function-token"
  );
  const invocation = await SandboxFunctionInvocationResource.makeNew(
    authenticator,
    { sandboxFunction, input: { message: "hello" } }
  );

  return {
    authenticator,
    frame,
    globalSpace,
    invocation,
    publicationId,
    sandbox,
    sandboxFunction,
    space,
    workspace,
  };
}

describe("SandboxFunctionInvocationResource", () => {
  it("lists the most recent invocations for one function", async () => {
    const { authenticator, space, sandboxFunction, invocation } =
      await setupExecutionTest();
    await invocation.succeed({ commentId: "comment-1" });

    const secondInvocation = await SandboxFunctionInvocationResource.makeNew(
      authenticator,
      { sandboxFunction, input: { message: "second" } }
    );
    await secondInvocation.fail(new Error("second invocation failed"));

    const thirdInvocation = await SandboxFunctionInvocationResource.makeNew(
      authenticator,
      { sandboxFunction, input: { message: "third" } }
    );
    await thirdInvocation.succeed({ commentId: "comment-3" });

    const otherFile = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "other.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });
    const otherFunction = await SandboxFunctionResource.makeNew(authenticator, {
      space,
      file: otherFile,
      slug: "other-function",
      description: "Run another function.",
      inputSchema,
      outputSchema,
    });
    await SandboxFunctionInvocationResource.makeNew(authenticator, {
      sandboxFunction: otherFunction,
      input: { message: "other" },
    });

    const recentInvocations =
      await SandboxFunctionInvocationResource.listRecent(authenticator, {
        sandboxFunction,
        limit: 2,
      });

    expect(recentInvocations.map((item) => item.sId)).toEqual([
      thirdInvocation.sId,
      secondInvocation.sId,
    ]);
    expect(recentInvocations[0]?.result).toEqual({ commentId: "comment-3" });
    expect(recentInvocations[1]?.error).toEqual({
      code: "invocation_failed",
      message: "second invocation failed",
    });
    expect(recentInvocations[0]?.toJSONForLLM()).toMatchObject({
      invocationId: thirdInvocation.sId,
      status: "succeeded",
      input: { message: "third" },
      result: { commentId: "comment-3" },
    });
    expect(recentInvocations[1]?.toJSONForLLM()).toMatchObject({
      invocationId: secondInvocation.sId,
      status: "errored",
      input: { message: "second" },
      error: {
        code: "invocation_failed",
        message: "second invocation failed",
      },
    });
    // These invocations settled without going through execute(), so no bundle hash was stamped
    // and none must be invented.
    expect(recentInvocations[0]?.toJSONForLLM()).not.toHaveProperty(
      "bundleSha256"
    );

    const formatted = formatSandboxFunctionInvocations(
      sandboxFunction.slug,
      recentInvocations
    );
    expect(formatted).toContain('"status": "succeeded"');
    expect(formatted).toContain('"input": {');
    expect(formatted).toContain('"result": {');
    expect(formatted).toContain('"message": "second invocation failed"');
    expect(formatted).toContain('"code": "invocation_failed"');
    expect(formatted).toContain('"createdAt":');
    expect(formatted).toContain('"updatedAt":');
  });

  it("shows readers only their invocations while Pod administrators see all", async () => {
    const { authenticator, workspace, space, sandboxFunction, invocation } =
      await setupExecutionTest();
    const reader = await UserFactory.basic();
    await MembershipFactory.associate(workspace, reader, { role: "user" });
    const addResult = await space.addMembers(authenticator, {
      userIds: [reader.sId],
    });
    expect(addResult.isOk()).toBe(true);
    const readerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      reader.sId,
      workspace.sId
    );
    const readerInvocation = await SandboxFunctionInvocationResource.makeNew(
      readerAuth,
      {
        sandboxFunction,
        input: { message: "reader-owned" },
      }
    );

    const readerInvocations =
      await SandboxFunctionInvocationResource.listRecent(readerAuth, {
        sandboxFunction,
        limit: 10,
      });
    expect(readerInvocations.map(({ sId }) => sId)).toEqual([
      readerInvocation.sId,
    ]);
    await expect(
      SandboxFunctionInvocationResource.fetchById(readerAuth, {
        sandboxFunction,
        invocationId: invocation.sId,
      })
    ).resolves.toBeNull();

    const administratorInvocations =
      await SandboxFunctionInvocationResource.listRecent(authenticator, {
        sandboxFunction,
        limit: 10,
      });
    expect(administratorInvocations.map(({ sId }) => sId)).toEqual([
      readerInvocation.sId,
      invocation.sId,
    ]);
  });

  it("hides userless invocations from readers but allows administrator and system reads", async () => {
    const { authenticator, workspace, sandboxFunction } =
      await setupExecutionTest();
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const userlessInvocation = await SandboxFunctionInvocationResource.makeNew(
      userlessAuth,
      {
        sandboxFunction,
        input: { message: "userless" },
      }
    );
    const reader = await UserFactory.basic();
    await MembershipFactory.associate(workspace, reader, { role: "user" });
    const readerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      reader.sId,
      workspace.sId
    );

    await expect(
      SandboxFunctionInvocationResource.fetchById(readerAuth, {
        sandboxFunction,
        invocationId: userlessInvocation.sId,
      })
    ).resolves.toBeNull();
    await expect(
      SandboxFunctionInvocationResource.fetchById(authenticator, {
        sandboxFunction,
        invocationId: userlessInvocation.sId,
      })
    ).resolves.toMatchObject({ sId: userlessInvocation.sId });
    await expect(
      SandboxFunctionInvocationResource.fetchById(userlessAuth, {
        sandboxFunction,
        invocationId: userlessInvocation.sId,
        access: "system",
      })
    ).resolves.toMatchObject({ sId: userlessInvocation.sId });
  });

  it("formats an explicit message when a function has no invocations", () => {
    expect(formatSandboxFunctionInvocations("never-called", [])).toBe(
      'No invocations found for pod function "never-called".'
    );
  });

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
      JSON.stringify({ version: 2, input: { message: "hello" } })
    );
    expect(fileStorageMock.saveFileCalls).toContainEqual({
      filePath: invocation.gcsPath,
      content: expect.any(Buffer),
      contentType: "application/json",
    });

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.input).toEqual({ message: "hello" });
  });

  it("stores and reloads its context from GCS", async () => {
    const { authenticator, sandboxFunction } = await setupExecutionTest();
    const invocation = await SandboxFunctionInvocationResource.makeNew(
      authenticator,
      {
        sandboxFunction,
        input: undefined,
        context: { timezone: "Europe/Paris" },
      }
    );

    expect(invocation.context).toEqual({ timezone: "Europe/Paris" });
    expect(fileStorageMock.getObject(invocation.gcsPath!)).toBe(
      JSON.stringify({
        version: 2,
        context: { timezone: "Europe/Paris" },
      })
    );

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.context).toEqual({ timezone: "Europe/Paris" });
  });

  it("records the initiating user", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    expect(invocation.userId).toBe(authenticator.user()?.id);

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.userId).toBe(authenticator.user()?.id);
  });

  it("stores a null user for userless origins", async () => {
    const { authenticator, sandboxFunction } = await setupExecutionTest();

    // A userless workspace auth (e.g. public API key run) has no user to attribute.
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      authenticator.getNonNullableWorkspace().sId
    );
    expect(userlessAuth.user()).toBeNull();

    const invocation = await SandboxFunctionInvocationResource.makeNew(
      userlessAuth,
      { sandboxFunction, input: undefined }
    );
    expect(invocation.userId).toBeNull();
  });

  it("returns an empty record for a version it does not know", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    await getPrivateUploadBucket()
      .file(invocation.gcsPath!)
      .save(Buffer.from(JSON.stringify({ version: 3 }), "utf-8"));

    // Listings load every invocation's blob, so one unreadable record must not fail the listing.
    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.input).toBeUndefined();
    expect(refetched?.result).toBeUndefined();
    expect(refetched?.error).toBeUndefined();
  });

  it("returns an empty record for a blob that is not valid JSON", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    await getPrivateUploadBucket()
      .file(invocation.gcsPath!)
      .save(Buffer.from('{"version": 2, "input"', "utf-8"));

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.input).toBeUndefined();
    expect(refetched?.error).toBeUndefined();
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
    expect(invocation.error).toEqual({
      code: "invocation_failed",
      message: "sandbox unavailable",
    });
    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.result).toBeUndefined();
    expect(refetched?.error).toEqual({
      code: "invocation_failed",
      message: "sandbox unavailable",
    });
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sandbox_function_invocation_error",
        invocationId: invocation.sId,
        error: { code: "invocation_failed", message: "sandbox unavailable" },
      }),
      { invocationId: invocation.sId }
    );
  });

  it("keeps the code and status of a classified failure", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    await invocation.fail({
      code: "http_error",
      message: "Function returned HTTP 503.",
      status: 503,
    });

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.error).toEqual({
      code: "http_error",
      message: "Function returned HTTP 503.",
      status: 503,
    });
  });

  it("makes succeed a compare-and-set so a second delivery is a no-op", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();
    const result = { commentId: "comment-1" };

    expect(await invocation.succeed(result)).toBe(true);
    expect(await invocation.succeed({ commentId: "comment-2" })).toBe(false);

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("succeeded");
    expect(refetched?.result).toEqual(result);
    expect(fileStorageMock.getObject(invocation.gcsPath!)).toContain(
      '"commentId":"comment-1"'
    );
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects fail after succeed without overwriting the result", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();
    const result = { commentId: "comment-1" };

    expect(await invocation.succeed(result)).toBe(true);
    expect(await invocation.fail(new Error("late failure"))).toBe(false);

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("succeeded");
    expect(refetched?.result).toEqual(result);
    expect(refetched?.error).toBeUndefined();
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects markCreatedAsErrored after succeed", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    expect(await invocation.succeed({ commentId: "comment-1" })).toBe(true);
    expect(
      await invocation.markCreatedAsErrored({
        code: "invocation_failed",
        message: "activity timed out",
      })
    ).toBe(false);

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("succeeded");
    expect(refetched?.result).toEqual({ commentId: "comment-1" });
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledTimes(1);
  });

  it("releases a won succeed claim when the terminal blob write fails", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();
    fileStorageMock.setFileSaveFails(
      (filePath) => filePath === invocation.gcsPath
    );

    await expect(
      invocation.succeed({ commentId: "comment-1" })
    ).rejects.toThrow();

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("created");
    expect(publishSandboxFunctionInvocationEvent).not.toHaveBeenCalled();

    fileStorageMock.setFileSaveFails(() => false);
    expect(
      await refetched!.fail(new Error("recoverable after gcs failure"))
    ).toBe(true);
    expect(refetched!.status).toBe("errored");
  });

  it("migrates a v1 blob, which recorded the message only", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    // A message distinct from anything the current code writes, so the assertion can only pass
    // by reading the seeded blob.
    await getPrivateUploadBucket()
      .file(invocation.gcsPath!)
      .save(
        Buffer.from(
          JSON.stringify({
            version: 1,
            input: { message: "hello" },
            context: { timezone: "Europe/Paris" },
            error: "written before codes existed",
          }),
          "utf-8"
        )
      );

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.input).toEqual({ message: "hello" });
    // Fields the v1 and v2 shapes have in common survive the migration.
    expect(refetched?.context).toEqual({ timezone: "Europe/Paris" });
    expect(refetched?.error).toEqual({
      code: "invocation_failed",
      message: "written before codes existed",
    });

    // The next write persists it as v2, so a blob is migrated once rather than on every read.
    await refetched!.succeed({ commentId: "comment-1" });
    expect(fileStorageMock.getObject(invocation.gcsPath!)).toContain(
      '"version":2'
    );
  });

  it("migrates a v1 blob that recorded no error", async () => {
    const { authenticator, sandboxFunction, invocation } =
      await setupExecutionTest();

    // The GCS path backfill wrote bare v1 blobs, so this shape is real.
    await getPrivateUploadBucket()
      .file(invocation.gcsPath!)
      .save(Buffer.from(JSON.stringify({ version: 1 }), "utf-8"));

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.error).toBeUndefined();
    expect(refetched?.input).toBeUndefined();
  });

  it("executes an invocation on the pod sandbox", async () => {
    const { authenticator, space, sandboxFunction, sandbox, invocation } =
      await setupExecutionTest();
    const updateLastActivityAtSpy = vi.spyOn(sandbox, "updateLastActivityAt");
    const loggerInfoSpy = vi
      .spyOn(logger, "info")
      .mockImplementation(() => undefined);
    const execSpy = vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: SUCCEEDED_STDOUT,
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
    expect(refetchedInvocation?.status).toBe("succeeded");
    // The terminal blob records which publish served the invocation, and inspect_invocations
    // reports it so a caller can match invocations to the hash publish/get echo.
    expect(refetchedInvocation?.bundleSha256).toBe(TEST_BUNDLE_SHA256);
    expect(refetchedInvocation?.toJSONForLLM()).toMatchObject({
      bundleSha256: TEST_BUNDLE_SHA256,
    });
    // execute() itself never touches lastActivityAt: ensurePodSandboxReady's
    // ensureActive already writes it under the lifecycle lock, and a second
    // write per invocation was pure hot-row churn on the sandbox row.
    expect(updateLastActivityAtSpy).not.toHaveBeenCalled();
    expect(ensurePodSandboxReady).toHaveBeenCalledWith(authenticator, space, {
      requireRunning: false,
    });
    expect(generateSandboxFunctionInvocationToken).toHaveBeenCalledWith(
      authenticator,
      {
        sandbox,
        sandboxFunction,
        owner: { kind: "pod", spaceId: space.sId },
        invocationId: invocation.sId,
        execId: expect.any(String),
        noTools: false,
      }
    );
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(tracerMocks.trace).toHaveBeenCalledWith(
      "sandbox.function.execute",
      { resource: "pod" },
      expect.any(Function)
    );
    expect(tracerMocks.setTag).toHaveBeenCalledWith(
      "function.owner_kind",
      "pod"
    );
    expect(tracerMocks.setTag).toHaveBeenCalledWith("pod.space_id", space.sId);
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        functionOwnerKind: "pod",
        functionName: sandboxFunction.slug,
        invocationId: invocation.sId,
        spaceId: space.sId,
      }),
      "Sandbox function stdout result delivery"
    );

    const execCall = execSpy.mock.calls[0];
    expect(execCall).toBeDefined();
    if (!execCall) {
      return;
    }
    const [, command, opts] = execCall;
    // The bundle is read from the read-only mount, so the command is just the run, no staging write.
    expect(command).toBe(
      "/opt/bin/dsbx function run --result-delivery stdout -- 'add-comment'"
    );
    expect(opts?.envVars).toMatchObject({
      DUST_FUNCTIONS_DIR: `/sandbox-functions/pods/${space.sId}`,
      DUST_POD_DATABASES_DIR: "/pod-state/databases",
      DUST_POD_DATABASE_MAX_SIZE_BYTES: "1073741824",
      // Published outside an app folder, so its databases are unprefixed.
      DUST_POD_DATABASE_PREFIX: "",
      DUST_SANDBOX_TOKEN: "sbt-function-token",
      DUST_FUNCTION_WARM_ENABLED: "0",
    });
    expect(opts?.envVars).not.toHaveProperty(
      "DUST_FRAME_PUBLICATION_DESCRIPTOR_PATH"
    );
    expect(
      JSON.parse(opts?.envVars?.DUST_POD_USER_IDENTITY ?? "")
    ).toMatchObject({
      workspaceId: authenticator.getNonNullableWorkspace().sId,
      // The executor is a workspace admin: an editor of every pod, a member of none.
      isPodEditor: true,
      isPodMember: false,
      user: {
        sId: authenticator.getNonNullableUser().sId,
        fullName: authenticator.getNonNullableUser().fullName(),
      },
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
      bundleSha256: TEST_BUNDLE_SHA256,
    });
  });

  it("executes a Frame function from its exact immutable publication", async () => {
    const {
      authenticator,
      frame,
      invocation,
      publicationId,
      sandbox,
      sandboxFunction,
      space,
    } = await setupFrameExecutionTest();
    const execSpy = vi
      .spyOn(sandbox, "exec")
      .mockResolvedValue(
        new Ok({ exitCode: 0, stdout: SUCCEEDED_STDOUT, stderr: "" })
      );
    const loggerInfoSpy = vi
      .spyOn(logger, "info")
      .mockImplementation(() => undefined);

    const result = await invocation.execute(authenticator);

    expect(result.isOk()).toBe(true);
    expect(ensureFrameSandboxReady).toHaveBeenCalledWith(authenticator, frame, {
      requireRunning: false,
    });
    expect(ensurePodSandboxReady).not.toHaveBeenCalled();
    expect(generateSandboxFunctionInvocationToken).toHaveBeenCalledWith(
      authenticator,
      expect.objectContaining({
        sandbox,
        sandboxFunction,
        owner: {
          kind: "frame",
          frameId: frame.sId,
          spaceId: space.sId,
        },
      })
    );
    const execOptions = execSpy.mock.calls[0]?.[2];
    expect(execOptions?.envVars).toMatchObject({
      DUST_FRAME_PUBLICATION_DESCRIPTOR_PATH: `/frames/${frame.sId}/publications/${publicationId}/publication.json`,
      DUST_POD_DATABASES_DIR: "/pod-state/databases",
      DUST_POD_DATABASE_MAX_SIZE_BYTES: "1073741824",
      DUST_POD_DATABASE_PREFIX: "",
      DUST_FUNCTIONS_DIR: `/frames/${frame.sId}/publications/${publicationId}/functions`,
      DUST_SANDBOX_TOKEN: "sbt-frame-function-token",
    });
    expect(invocation.gcsPath).toBe(
      `w/${authenticator.getNonNullableWorkspace().sId}/frames/${frame.sId}/invocations/${invocation.sId}`
    );
    expect(tracerMocks.trace).toHaveBeenCalledWith(
      "sandbox.function.execute",
      { resource: "frame" },
      expect.any(Function)
    );
    expect(tracerMocks.setTag).toHaveBeenCalledWith("frame.id", frame.sId);
    expect(tracerMocks.setTag).toHaveBeenCalledWith(
      "frame.publication_id",
      publicationId
    );
    expect(tracerMocks.setTag).toHaveBeenCalledWith(
      "frame.source_scope",
      "pod"
    );
    expect(tracerMocks.setTag).toHaveBeenCalledWith(
      "frame.source_scope_id",
      space.sId
    );
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        frameId: frame.sId,
        frameSourceScope: "pod",
        frameSourceScopeId: space.sId,
        functionOwnerKind: "frame",
        functionName: sandboxFunction.slug,
        invocationId: invocation.sId,
        publicationId,
      }),
      "Sandbox function stdout result delivery"
    );
  });

  it("uses the lifecycle-locked Frame location for authorization and token scope", async () => {
    const { authenticator, frame, invocation, sandbox, sandboxFunction } =
      await setupFrameExecutionTest();
    const movedSpace = await SpaceFactory.project(
      authenticator.getNonNullableWorkspace()
    );
    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({
        sandbox,
        freshlyCreated: false,
        scope: { spaceId: movedSpace.sId },
      })
    );
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: SUCCEEDED_STDOUT, stderr: "" })
    );

    const result = await invocation.execute(authenticator);

    expect(result.isOk()).toBe(true);
    expect(generateSandboxFunctionInvocationToken).toHaveBeenCalledWith(
      authenticator,
      expect.objectContaining({
        sandboxFunction,
        owner: {
          kind: "frame",
          frameId: frame.sId,
          spaceId: movedSpace.sId,
        },
      })
    );
  });

  it("uses the global space token scope for a standalone Frame", async () => {
    const {
      authenticator,
      frame,
      globalSpace,
      invocation,
      sandbox,
      sandboxFunction,
    } = await setupFrameExecutionTest({ standalone: true });
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: SUCCEEDED_STDOUT, stderr: "" })
    );

    const result = await invocation.execute(authenticator);

    expect(result.isOk()).toBe(true);
    expect(generateSandboxFunctionInvocationToken).toHaveBeenCalledWith(
      authenticator,
      expect.objectContaining({
        sandboxFunction,
        owner: {
          kind: "frame",
          frameId: frame.sId,
          spaceId: globalSpace.sId,
        },
      })
    );
  });

  it("denies a userless Frame invocation before sandbox wakeup", async () => {
    const { sandboxFunction, workspace } = await setupFrameExecutionTest();
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const result = await sandboxFunction.invoke(userlessAuth, {});

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("logged-in user");
    }
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });

  it("reads back a spilled result and delivers the full output", async () => {
    const { authenticator, sandboxFunction, sandbox, invocation } =
      await setupExecutionTest();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: stdoutEnvelope({
          ok: true,
          resultFile: "/tmp/dust-fn-results/spill.json",
          resultBytes: 300_000,
        }),
        stderr: "",
      })
    );
    const readFileSpy = vi
      .spyOn(sandbox, "readFile")
      .mockResolvedValue(
        new Ok(
          Buffer.from(
            JSON.stringify({ ok: true, output: { commentId: "comment-big" } }),
            "utf8"
          )
        )
      );

    const executionResult = await invocation.execute(authenticator);
    if (executionResult.isErr()) {
      throw executionResult.error;
    }

    expect(readFileSpy).toHaveBeenCalledWith(
      authenticator,
      "/tmp/dust-fn-results/spill.json"
    );
    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("succeeded");
    expect(refetched?.result).toEqual({ commentId: "comment-big" });
  });

  it("fails the invocation when the spilled result cannot be read back", async () => {
    const { authenticator, sandboxFunction, sandbox, invocation } =
      await setupExecutionTest();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: stdoutEnvelope({
          ok: true,
          resultFile: "/tmp/dust-fn-results/spill.json",
          resultBytes: 300_000,
        }),
        stderr: "",
      })
    );
    vi.spyOn(sandbox, "readFile").mockResolvedValue(
      new Err(new Error("file not found"))
    );

    const executionResult = await invocation.execute(authenticator);
    if (executionResult.isErr()) {
      throw executionResult.error;
    }

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("errored");
    expect(refetched?.error).toMatchObject({
      code: "invocation_failed",
      message:
        "Pod function result could not be read back from /tmp/dust-fn-results/spill.json: file not found",
    });
  });

  it("passes the app's database prefix, derived from the function slug", async () => {
    // This is what lets the bundle's `db("chat")` resolve to the app's own database without the
    // app name appearing anywhere in the function's source.
    const { authenticator, sandbox, invocation } = await setupExecutionTest(
      "optional",
      "delegated",
      "durable",
      "task-list__add-comment"
    );
    const execSpy = vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: "hello world\n",
        stderr: "",
      })
    );

    const executionResult = await invocation.execute(authenticator);
    if (executionResult.isErr()) {
      throw executionResult.error;
    }

    const opts = execSpy.mock.calls[0]?.[2];
    expect(opts?.envVars).toMatchObject({
      DUST_POD_DATABASE_PREFIX: "task_list__",
    });
  });

  it.each([
    "errored",
    "succeeded",
  ] as const)("does not execute an invocation with terminal status %s", async (status) => {
    const { authenticator, sandbox, invocation } = await setupExecutionTest();
    const execSpy = vi.spyOn(sandbox, "exec");

    if (status === "errored") {
      await invocation.fail(new Error("execution failed"));
    } else {
      await invocation.succeed({ commentId: "comment-1" });
    }

    const result = await invocation.execute(authenticator);

    expect(result.isOk()).toBe(true);
    expect(ensurePodSandboxReady).not.toHaveBeenCalled();
    expect(generateSandboxFunctionInvocationToken).not.toHaveBeenCalled();
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("clears user identity for a userless invocation", async () => {
    const { authenticator, sandbox, invocation } = await setupExecutionTest();
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      authenticator.getNonNullableWorkspace().sId
    );
    const execSpy = vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: SUCCEEDED_STDOUT,
        stderr: "",
      })
    );

    const executionResult = await invocation.execute(userlessAuth);
    if (executionResult.isErr()) {
      throw executionResult.error;
    }

    expect(execSpy.mock.calls[0]?.[2]?.envVars).toMatchObject({
      DUST_POD_USER_IDENTITY: "",
    });
  });

  it("clears user identity when the executor differs from the invocation user", async () => {
    const { workspace, sandbox, invocation } = await setupExecutionTest();
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    const execSpy = vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: SUCCEEDED_STDOUT,
        stderr: "",
      })
    );

    const executionResult = await invocation.execute(otherUserAuth);
    if (executionResult.isErr()) {
      throw executionResult.error;
    }

    expect(execSpy.mock.calls[0]?.[2]?.envVars).toMatchObject({
      DUST_POD_USER_IDENTITY: "",
    });
  });

  it("clears user identity when the invocation user is no longer a member", async () => {
    const { authenticator, sandbox, invocation } = await setupExecutionTest();
    vi.spyOn(
      MembershipResource,
      "getActiveRoleForUserInWorkspace"
    ).mockResolvedValueOnce("none");
    const execSpy = vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: SUCCEEDED_STDOUT,
        stderr: "",
      })
    );

    const executionResult = await invocation.execute(authenticator);
    if (executionResult.isErr()) {
      throw executionResult.error;
    }

    expect(execSpy.mock.calls[0]?.[2]?.envVars).toMatchObject({
      DUST_POD_USER_IDENTITY: "",
    });
  });

  it("fails closed when a newer application persisted an unknown policy", async () => {
    const { authenticator, sandbox, sandboxFunction, invocation } =
      await setupExecutionTest();
    await frontSequelize.getQueryInterface().bulkUpdate(
      "sandbox_functions",
      { userIdentity: "future_policy" },
      {
        id: sandboxFunction.id,
        workspaceId: sandboxFunction.workspaceId,
      }
    );

    const execSpy = vi.spyOn(sandbox, "exec");

    const executionResult = await invocation.execute(authenticator);

    expect(executionResult.isErr()).toBe(true);
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("blocks execution with an authenticator from another workspace", async () => {
    const { sandbox, invocation } = await setupExecutionTest();
    const { authenticator: otherWorkspaceAuth } = await createResourceTest({
      role: "admin",
    });
    const execSpy = vi.spyOn(sandbox, "exec");

    const executionResult = await invocation.execute(otherWorkspaceAuth);

    expect(executionResult.isErr()).toBe(true);
    if (executionResult.isOk()) {
      return;
    }
    expect(executionResult.error.message).toBe(
      "This Pod Function belongs to another workspace."
    );
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("blocks a required invocation when membership is revoked before execution", async () => {
    const { authenticator, sandbox, invocation } = await setupExecutionTest(
      "workspace_user_required"
    );
    vi.spyOn(
      MembershipResource,
      "getActiveRoleForUserInWorkspace"
    ).mockResolvedValueOnce("none");
    const execSpy = vi.spyOn(sandbox, "exec");

    const executionResult = await invocation.execute(authenticator);

    expect(executionResult.isErr()).toBe(true);
    if (executionResult.isOk()) {
      return;
    }
    expect(executionResult.error.message).toContain(
      "requires a logged-in user"
    );
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("executes an interactive invocation whose session origin was persisted", async () => {
    const { authenticator, sandbox, invocation } = await setupExecutionTest(
      "interactive_workspace_user_required",
      "interactive_session"
    );
    vi.spyOn(authenticator, "authMethod").mockReturnValue("session");
    const execSpy = vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: SUCCEEDED_STDOUT,
        stderr: "",
      })
    );

    const executionResult = await invocation.execute(authenticator);

    expect(executionResult.isOk()).toBe(true);
    expect(execSpy).toHaveBeenCalledOnce();
  });

  it("blocks an interactive function whose invocation origin is delegated", async () => {
    const { authenticator, sandbox, invocation } = await setupExecutionTest(
      "interactive_workspace_user_required"
    );
    vi.spyOn(authenticator, "authMethod").mockReturnValue("session");
    const execSpy = vi.spyOn(sandbox, "exec");

    const executionResult = await invocation.execute(authenticator);

    expect(executionResult.isErr()).toBe(true);
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("fails the invocation when stdout carries no result envelope", async () => {
    const { authenticator, sandboxFunction, sandbox, invocation } =
      await setupExecutionTest();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 1,
        stdout: "",
        stderr: "dsbx command failed: connection refused",
      })
    );

    const result = await invocation.execute(authenticator);

    expect(result.isOk()).toBe(true);
    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("errored");
    expect(refetched?.error).toEqual({
      code: "invocation_failed",
      message: "Pod function produced no stdout result envelope.",
    });
  });

  it("persists a stdout envelope", async () => {
    const { authenticator, sandboxFunction, sandbox, invocation } =
      await setupExecutionTest();
    const execSpy = vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: stdoutEnvelope({
          ok: true,
          output: { commentId: "from-stdout" },
        }),
        stderr: "",
      })
    );

    const executionResult = await invocation.execute(authenticator);
    expect(executionResult.isOk()).toBe(true);

    const [, command] = execSpy.mock.calls[0]!;
    expect(command).toBe(
      "/opt/bin/dsbx function run --result-delivery stdout -- 'add-comment'"
    );

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("succeeded");
    expect(refetched?.result).toEqual({ commentId: "from-stdout" });
  });

  it("persists structured runner errors from stdout envelopes with exit 0", async () => {
    const { authenticator, sandboxFunction, sandbox, invocation } =
      await setupExecutionTest();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: stdoutEnvelope({
          ok: false,
          error: { code: "threw", message: "boom" },
        }),
        stderr: "",
      })
    );

    const executionResult = await invocation.execute(authenticator);
    expect(executionResult.isOk()).toBe(true);

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("errored");
    expect(refetched?.error).toEqual({ code: "threw", message: "boom" });
  });

  it("persists a stdout invocation_failed envelope even when exit code is non-zero", async () => {
    const { authenticator, sandboxFunction, sandbox, invocation } =
      await setupExecutionTest();
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 1,
        stdout: stdoutEnvelope({
          ok: false,
          error: {
            code: "invocation_failed",
            message: "function produced no output",
          },
        }),
        stderr: "",
      })
    );

    const executionResult = await invocation.execute(authenticator);
    expect(executionResult.isOk()).toBe(true);

    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: invocation.sId }
    );
    expect(refetched?.status).toBe("errored");
    expect(refetched?.error).toEqual({
      code: "invocation_failed",
      message: "function produced no output",
    });
  });
});

describe("SandboxFunctionInvocationResource.createAndStartExecution", () => {
  async function setupInlineTest(
    executionMode: SandboxFunctionExecutionMode = "fast"
  ) {
    const setup = await setupExecutionTest(
      "optional",
      "delegated",
      executionMode
    );
    // Stand in for the lifecycle, which refuses rather than creating, waking, or recreating a
    // sandbox when the caller cannot wait for one.
    vi.mocked(ensurePodSandboxReady).mockImplementation(
      async (_auth, _pod, opts) => {
        if (opts?.requireRunning && setup.sandbox.status !== "running") {
          return new Err(new SandboxNotRunningError());
        }
        return new Ok({ sandbox: setup.sandbox, freshlyCreated: false });
      }
    );
    const execSpy = vi.spyOn(setup.sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: stdoutEnvelope({ ok: true, output: { commentId: "inline" } }),
        stderr: "",
      })
    );

    return { ...setup, execSpy };
  }

  it("runs a fast invocation inline instead of starting the workflow", async () => {
    const { authenticator, sandboxFunction, execSpy } = await setupInlineTest();

    const result =
      await SandboxFunctionInvocationResource.createAndStartExecution(
        authenticator,
        { sandboxFunction, body: { input: { message: "hello" } } }
      );

    expect(result.isOk()).toBe(true);
    expect(execSpy).toHaveBeenCalledOnce();
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    if (result.isErr()) {
      return;
    }
    expect(result.value.status).toBe("succeeded");
    expect(result.value.result).toEqual({ commentId: "inline" });
    // The settled outcome is available in memory, so callers can answer without reading the
    // event stream back out of Redis.
    expect(result.value.settledOutcome()).toEqual({
      status: "succeeded",
      result: { commentId: "inline" },
    });
    // Both blob writes are behind the response on the inline path (deferred initial write,
    // write-behind terminal write); settling drains them, after which the blob must be complete
    // (input and result) for later fetches.
    await result.value.settleInitialPersistence();
    const refetched = await SandboxFunctionInvocationResource.fetchById(
      authenticator,
      { sandboxFunction, invocationId: result.value.sId }
    );
    expect(refetched?.input).toEqual({ message: "hello" });
    expect(refetched?.result).toEqual({ commentId: "inline" });
    // A rehydrated instance never short-circuits: it did not run the invocation.
    expect(refetched?.settledOutcome()).toBeNull();
    // An inline invocation holds a request while it runs, so it gets a far shorter ceiling than
    // the workflow's.
    const [, , execOptions] = execSpy.mock.calls[0]!;
    expect(execOptions?.timeoutMs).toBe(10 * 1000);
    expect(execOptions?.envVars?.DUST_FUNCTION_WARM_ENABLED).toBe("1");
    // A fast function runs under a token that cannot call tools.
    expect(generateSandboxFunctionInvocationToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ noTools: true })
    );
  });

  it("delivers the inline outcome even when write-behind persistence fails", async () => {
    const { authenticator, sandboxFunction, execSpy } = await setupInlineTest();
    // Every blob write for this invocation fails: the deferred initial write and the
    // write-behind terminal write. Neither may take down the caller's response — the outcome
    // already reached the caller and the event stream, and the loss is logged, not thrown.
    fileStorageMock.setFileSaveFails((filePath) =>
      filePath.includes("sandbox_functions")
    );

    const result =
      await SandboxFunctionInvocationResource.createAndStartExecution(
        authenticator,
        { sandboxFunction, body: { input: { message: "hello" } } }
      );

    expect(result.isOk()).toBe(true);
    expect(execSpy).toHaveBeenCalledOnce();
    if (result.isErr()) {
      return;
    }
    expect(result.value.status).toBe("succeeded");
    expect(result.value.settledOutcome()).toEqual({
      status: "succeeded",
      result: { commentId: "inline" },
    });
    // Draining the chain must also not throw: the failure is contained to the log.
    await result.value.settleInitialPersistence();
  });

  it("runs a durable function under a token that can call tools", async () => {
    const { authenticator, sandboxFunction, execSpy } =
      await setupInlineTest("durable");

    const result =
      await SandboxFunctionInvocationResource.createAndStartExecution(
        authenticator,
        { sandboxFunction, body: {} }
      );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    const executionResult = await result.value.execute(authenticator);
    expect(executionResult.isOk()).toBe(true);
    expect(generateSandboxFunctionInvocationToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ noTools: false })
    );
    const [, , execOptions] = execSpy.mock.calls[0]!;
    expect(execOptions?.envVars?.DUST_FUNCTION_WARM_ENABLED).toBe("0");
  });

  it("starts the workflow for a durable function", async () => {
    const { authenticator, sandboxFunction, execSpy } =
      await setupInlineTest("durable");

    const result =
      await SandboxFunctionInvocationResource.createAndStartExecution(
        authenticator,
        { sandboxFunction, body: {} }
      );

    expect(result.isOk()).toBe(true);
    expect(execSpy).not.toHaveBeenCalled();
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
  });

  // Resuming a sandbox takes far longer than a request can be held, and nothing has executed at
  // that point, so the workflow takes the invocation over.
  it("starts the workflow when the sandbox is not running", async () => {
    const { authenticator, sandboxFunction, sandbox, execSpy } =
      await setupInlineTest();
    await sandbox.updateStatus("sleeping");

    const result =
      await SandboxFunctionInvocationResource.createAndStartExecution(
        authenticator,
        { sandboxFunction, body: {} }
      );

    expect(result.isOk()).toBe(true);
    expect(execSpy).not.toHaveBeenCalled();
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
    if (result.isErr()) {
      return;
    }
    expect(result.value.status).toBe("created");
  });

  it("records the failure of a fast invocation that errors inline", async () => {
    const { authenticator, sandboxFunction, execSpy } = await setupInlineTest();
    execSpy.mockResolvedValue(
      new Ok({
        exitCode: 1,
        stdout: stdoutEnvelope({
          ok: false,
          error: { code: "threw", message: "boom" },
        }),
        stderr: "",
      })
    );

    const result =
      await SandboxFunctionInvocationResource.createAndStartExecution(
        authenticator,
        { sandboxFunction, body: {} }
      );

    expect(result.isOk()).toBe(true);
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    if (result.isErr()) {
      return;
    }
    expect(result.value.status).toBe("errored");
    expect(result.value.error?.message).toContain("boom");
  });
});
