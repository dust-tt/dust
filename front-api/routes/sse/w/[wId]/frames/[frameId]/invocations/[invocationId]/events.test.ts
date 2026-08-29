import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { SandboxFunctionInvocationEvent } from "@app/types/api/sandbox_functions";
import { frameV2ContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
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

const inputSchema: JSONSchema = { type: "object" };
const outputSchema: JSONSchema = { type: "object" };

async function setupFrameInvocation({
  enableFramesV2 = true,
}: {
  enableFramesV2?: boolean;
} = {}) {
  const { workspace, auth: adminAuth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  if (enableFramesV2) {
    await FeatureFlagFactory.basic(adminAuth, "frames_v2");
  }
  const space = await SpaceFactory.project(workspace);
  const frame = await FileFactory.create(adminAuth, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 100,
    status: "ready",
    useCase: "project_context",
    useCaseMetadata: {
      spaceId: space.sId,
      activePublicationId: "publication-1",
    },
  });
  await frame.setShareScope(adminAuth, "workspace_and_emails");
  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      adminAuth,
      {
        frame,
        publicationId: "publication-1",
        functions: [
          {
            name: "run-function",
            description: "Run the Frame function.",
            userIdentity: "optional",
            executionMode: "durable",
            defaultStake: "low",
            bundleCode:
              "export default { fetch: async () => Response.json({}) };",
            inputSchema,
            outputSchema,
          },
        ],
      },
      transaction
    )
  );
  const sandboxFunction =
    await SandboxFunctionResource.fetchByFramePublicationAndSlug(adminAuth, {
      frame,
      publicationId: "publication-1",
      slug: "run-function",
    });
  if (!sandboxFunction) {
    throw new Error("Expected the Frame function to exist.");
  }

  const { user } = await createPrivateApiMockRequest({
    role: "user",
    workspace,
  });
  const callerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const invocation = await SandboxFunctionInvocationResource.makeNew(
    callerAuth,
    { sandboxFunction, input: { message: "hello" } }
  );

  return {
    adminAuth,
    frame,
    invocation,
    sandboxFunction,
    space,
    workspace,
  };
}

function getEvents({
  workspaceId,
  frameId,
  invocationId,
}: {
  workspaceId: string;
  frameId: string;
  invocationId: string;
}) {
  return honoApp.request(
    `/api/sse/w/${workspaceId}/frames/${frameId}/invocations/${invocationId}/events`
  );
}

function mockEventStream(event: SandboxFunctionInvocationEvent) {
  vi.mocked(getSandboxFunctionInvocationEvents).mockImplementation(
    async function* () {
      yield { eventId: "event-1", data: event };
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sse/w/:wId/frames/:frameId/invocations/:invocationId/events", () => {
  it("keeps an invocation streamable after the Frame republishes", async () => {
    const { frame, invocation, sandboxFunction, workspace } =
      await setupFrameInvocation();
    await frame.setActiveFramePublication("publication-2");
    mockEventStream({
      type: "sandbox_function_invocation_result",
      created: Date.now(),
      invocationId: invocation.sId,
      functionId: sandboxFunction.sId,
      result: { ok: true },
    });

    const response = await getEvents({
      workspaceId: workspace.sId,
      frameId: frame.sId,
      invocationId: invocation.sId,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"result":{"ok":true}');
    expect(getSandboxFunctionInvocationEvents).toHaveBeenCalledWith({
      invocationId: invocation.sId,
      lastEventId: null,
      signal: expect.any(AbortSignal),
    });
  });

  it("does not stream an invocation owned by another Frame", async () => {
    const { adminAuth, invocation, space, workspace } =
      await setupFrameInvocation();
    const otherFrame = await FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: "other-manifest.json",
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: {
        spaceId: space.sId,
        activePublicationId: "publication-1",
      },
    });
    await otherFrame.setShareScope(adminAuth, "workspace_and_emails");

    const response = await getEvents({
      workspaceId: workspace.sId,
      frameId: otherFrame.sId,
      invocationId: invocation.sId,
    });

    expect(response.status).toBe(404);
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });

  it("rechecks Frame use rights", async () => {
    const { adminAuth, frame, invocation, workspace } =
      await setupFrameInvocation();
    await frame.setShareScope(adminAuth, "emails_only");

    const response = await getEvents({
      workspaceId: workspace.sId,
      frameId: frame.sId,
      invocationId: invocation.sId,
    });

    expect(response.status).toBe(404);
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });

  it("is available only behind frames_v2", async () => {
    const { frame, invocation, workspace } = await setupFrameInvocation({
      enableFramesV2: false,
    });

    const response = await getEvents({
      workspaceId: workspace.sId,
      frameId: frame.sId,
      invocationId: invocation.sId,
    });

    expect(response.status).toBe(403);
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });
});
