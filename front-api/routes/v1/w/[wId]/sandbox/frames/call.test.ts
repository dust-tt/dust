import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import type { SandboxFunctionInvocationEvent } from "@app/types/api/sandbox_functions";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox_functions/events", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/events")
    >();
  return { ...actual, getSandboxFunctionInvocationEvents: vi.fn() };
});

vi.mock("@app/temporal/sandbox_functions/client", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/temporal/sandbox_functions/client")
    >();
  return {
    ...actual,
    launchSandboxFunctionInvocationWorkflow: vi.fn(
      async () => new Ok(undefined)
    ),
  };
});

const schema: JSONSchema = { type: "object" };

function eventStream(
  ...events: SandboxFunctionInvocationEvent[]
): ReturnType<typeof getSandboxFunctionInvocationEvents> {
  return (async function* () {
    for (const [index, data] of events.entries()) {
      yield { eventId: String(index), data };
    }
  })();
}

async function setup() {
  const context = await createSandboxTokenTestContext();
  await FeatureFlagFactory.basic(context.auth, "frames_v2");
  const sourceDirectoryPath = `conversation-${context.conversation.sId}/Status`;
  const publicationId = "publication-1";
  const frame = await FileFactory.create(context.auth, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 100,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: {
      conversationId: context.conversation.sId,
      activePublicationId: publicationId,
    },
    mountFilePath: `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Status/manifest.json`,
  });
  await frame.setShareScope(context.auth, "workspace_and_emails");
  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      context.auth,
      {
        frame,
        publicationId,
        functions: [
          {
            name: "get-status",
            description: "Get the status.",
            userIdentity: "optional",
            executionMode: "durable",
            defaultStake: "never_ask",
            bundleCode:
              "export default { fetch: async () => Response.json({}) };",
            inputSchema: schema,
            outputSchema: schema,
          },
        ],
      },
      transaction
    )
  );

  return { ...context, frame, sourceDirectoryPath };
}

function requestFrameCall({
  workspaceId,
  token,
  sourcePath,
  functionName = "get-status",
  input = { scope: "current" },
}: {
  workspaceId: string;
  token: string;
  sourcePath: string;
  functionName?: string;
  input?: unknown;
}) {
  return honoApp.request(`/api/v1/w/${workspaceId}/sandbox/frames/call`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sourcePath, functionName, input }),
  });
}

function requestFrameCallById({
  workspaceId,
  token,
  frameId,
  functionName = "get-status",
  input = { scope: "current" },
}: {
  workspaceId: string;
  token: string;
  frameId: string;
  functionName?: string;
  input?: unknown;
}) {
  return honoApp.request(
    `/api/v1/w/${workspaceId}/sandbox/frames/${frameId}/call`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ functionName, input }),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSandboxFunctionInvocationEvents).mockReturnValue(
    eventStream({
      type: "sandbox_function_invocation_result",
      created: 0,
      invocationId: "sfi_test",
      functionId: "sfn_test",
      result: { status: "ready" },
    })
  );
});

describe("sandbox Frame calls", () => {
  it("calls an active Frame function by its stable ID", async () => {
    const context = await setup();

    const response = await requestFrameCallById({
      workspaceId: context.workspace.sId,
      token: context.token,
      frameId: context.frame.sId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      frameId: context.frame.sId,
      functionName: "get-status",
      result: { status: "ready" },
    });
  });

  it("calls an active Frame function resolved from its source folder", async () => {
    const context = await setup();

    const response = await requestFrameCall({
      workspaceId: context.workspace.sId,
      token: context.token,
      sourcePath: context.sourceDirectoryPath,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      frameId: context.frame.sId,
      functionName: "get-status",
      result: { status: "ready" },
    });
  });

  it("rejects functions outside the active Frame publication", async () => {
    const context = await setup();

    const response = await requestFrameCall({
      workspaceId: context.workspace.sId,
      token: context.token,
      sourcePath: `${context.sourceDirectoryPath}/manifest.json`,
      functionName: "missing",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: expect.stringContaining('No active function named "missing"'),
      },
    });
  });

  it("returns the function error code and message", async () => {
    const context = await setup();
    vi.mocked(getSandboxFunctionInvocationEvents).mockReturnValue(
      eventStream({
        type: "sandbox_function_invocation_error",
        created: 0,
        invocationId: "sfi_test",
        functionId: "sfn_test",
        error: { code: "threw", message: "boom" },
      })
    );

    const response = await requestFrameCall({
      workspaceId: context.workspace.sId,
      token: context.token,
      sourcePath: context.sourceDirectoryPath,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        type: "invalid_request_error",
        message: expect.stringContaining("(threw): boom"),
      },
    });
  });
});
