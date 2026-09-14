import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type {
  SandboxFunctionInvocationEvent,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import type { FileShareScope } from "@app/types/files";
import { frameV2ContentType } from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox_functions/events", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/events")
    >();
  return {
    ...mod,
    publishSandboxFunctionInvocationEvent: vi.fn(),
    // Defaults to a stream that ends without settling, which is what an invocation still running
    // when the request returns looks like.
    getSandboxFunctionInvocationEvents: vi.fn(async function* () {}),
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
    launchSandboxFunctionToolWorkflow: vi.fn(async () => new Ok(undefined)),
  };
});

vi.mock("@app/lib/actions/tool_status", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/actions/tool_status")>();
  return {
    ...mod,
    setUserAlwaysApprovedTool: vi.fn(),
  };
});

import { setUserAlwaysApprovedTool } from "@app/lib/actions/tool_status";
import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import {
  launchSandboxFunctionInvocationWorkflow,
  launchSandboxFunctionToolWorkflow,
} from "@app/temporal/sandbox_functions/client";

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createFramePublicationFunction({
  adminAuth,
  frame,
  publicationId,
  userIdentity = "optional",
}: {
  adminAuth: Authenticator;
  frame: Awaited<ReturnType<typeof FileFactory.create>>;
  publicationId: string;
  userIdentity?: SandboxFunctionUserIdentityPolicy;
}) {
  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      adminAuth,
      {
        frame,
        publicationId,
        functions: [
          {
            name: "run-function",
            description: "Run the Frame function.",
            userIdentity,
            executionMode: "durable",
            defaultStake: "low",
            bundleCode: "export default () => ({ ok: true });",
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
      publicationId,
      slug: "run-function",
    });
  if (!sandboxFunction) {
    throw new Error("Expected the Frame function to exist.");
  }
  return sandboxFunction;
}

async function setupFrameV2Function({
  shareScope = "workspace_and_emails",
  withFramesV2FeatureFlag = true,
  standalone = false,
  userIdentity = "optional",
  addCallerToSpace = false,
  withSourcePath = userIdentity === "frame_author_required",
}: {
  shareScope?: FileShareScope;
  withFramesV2FeatureFlag?: boolean;
  standalone?: boolean;
  userIdentity?: SandboxFunctionUserIdentityPolicy;
  addCallerToSpace?: boolean;
  withSourcePath?: boolean;
} = {}) {
  const { workspace, auth: adminAuth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  if (withFramesV2FeatureFlag) {
    await FeatureFlagFactory.basic(adminAuth, "frames_v2");
  }
  const space = await SpaceFactory.project(workspace);
  const conversation = standalone
    ? await ConversationFactory.create(adminAuth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
      })
    : null;
  const publicationId = "publication-1";
  const sourceMountPath = conversation
    ? `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
      })}App/${FRAME_MANIFEST_FILE}`
    : `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: space.sId,
      })}App/${FRAME_MANIFEST_FILE}`;
  // A ready conversation file normally claims a source mount automatically. Omit its conversation
  // scope only for the missing-source fixture so the Resource lifecycle leaves it unmounted.
  const sourceScopeMetadata = conversation
    ? userIdentity === "frame_author_required" && !withSourcePath
      ? {}
      : { conversationId: conversation.sId }
    : { spaceId: space.sId };
  const frame = await FileFactory.create(adminAuth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 100,
    status: "ready",
    useCase:
      userIdentity === "frame_author_required" && !standalone
        ? "project_context"
        : "conversation",
    useCaseMetadata: {
      ...sourceScopeMetadata,
      activePublicationId: publicationId,
    },
    mountFilePath: withSourcePath ? sourceMountPath : null,
  });
  await frame.setShareScope(adminAuth, shareScope);
  const sandboxFunction = await createFramePublicationFunction({
    adminAuth,
    frame,
    publicationId,
    userIdentity,
  });

  // The last mock request owns the route session.
  const { user } = await createPrivateApiMockRequest({
    role: "user",
    workspace,
  });
  if (addCallerToSpace) {
    const [memberGroup] = await space.fetchRegularAutoGroups(adminAuth);
    if (!memberGroup) {
      throw new Error("Expected the project member group to exist.");
    }
    const addMemberResult = await memberGroup.dangerouslyAddMember(adminAuth, {
      user: user.toJSON(),
    });
    expect(addMemberResult.isOk()).toBe(true);
  }
  return {
    adminAuth,
    frame,
    sandboxFunction,
    space,
    user,
    workspace,
  };
}

// Builds a blocked action awaiting validation, the state spolu's creation gate produces for
// approval-requiring tools (created without a workflow launch).
async function setupFunctionForBlockedAction() {
  const setup = await setupFrameV2Function();
  const callerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    setup.user.sId,
    setup.workspace.sId
  );
  return { ...setup, callerAuth };
}

async function setupBlockedAction({
  permission = "high",
  blockedStatus = "blocked_validation_required",
  invocationOwnedByOtherMember = false,
  invocationOwnerless = false,
}: {
  permission?: MCPToolStakeLevelType;
  blockedStatus?:
    | "blocked_validation_required"
    | "blocked_authentication_required";
  invocationOwnedByOtherMember?: boolean;
  invocationOwnerless?: boolean;
} = {}) {
  const { workspace, sandboxFunction, adminAuth, callerAuth, space, frame } =
    await setupFunctionForBlockedAction();

  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
  await SpaceResource.makeDefaultsForWorkspace(adminAuth, {
    globalGroup,
    systemGroup,
  });
  const server = await InternalMCPServerInMemoryResource.makeNew(adminAuth, {
    name: "common_utilities",
    useCase: null,
  });
  const view = await MCPServerViewFactory.create(workspace, server.id, space);

  // By default the invocation is owned by the request's caller (resolver == initiating user).
  // Owning it by another member exercises the resolver != initiating-user path; a userless owner
  // (internal admin auth) exercises the null initiating-user path.
  let invocationOwnerAuth = callerAuth;
  if (invocationOwnerless) {
    invocationOwnerAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
  } else if (invocationOwnedByOtherMember) {
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    invocationOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
  }

  const invocation = await SandboxFunctionInvocationResource.makeNew(
    invocationOwnerAuth,
    { sandboxFunction, input: undefined }
  );
  const action = await SandboxFunctionMCPActionFactory.create(adminAuth, {
    invocation,
    mcpServerView: view,
    permission,
  });
  const [blockedCount] = await action.updateStatusFromExpected(adminAuth, {
    status: blockedStatus,
    expectedStatus: "running",
  });
  expect(blockedCount).toBe(1);

  return {
    workspace,
    sandboxFunction,
    invocation,
    action,
    view,
    adminAuth,
    frame,
  };
}

function postValidate({
  workspaceId,
  functionIdOrSlug,
  invocationId,
  actionId,
  body,
}: {
  workspaceId: string;
  functionIdOrSlug: string;
  invocationId: string;
  actionId: string;
  body: unknown;
}) {
  return honoApp.request(
    `/api/w/${workspaceId}/sandbox-functions/${encodeURIComponent(functionIdOrSlug)}/invocations/${invocationId}/actions/${actionId}/validate-action`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function postResolveAuthentication({
  workspaceId,
  functionIdOrSlug,
  invocationId,
  actionId,
  body,
}: {
  workspaceId: string;
  functionIdOrSlug: string;
  invocationId: string;
  actionId: string;
  body: unknown;
}) {
  return honoApp.request(
    `/api/w/${workspaceId}/sandbox-functions/${encodeURIComponent(functionIdOrSlug)}/invocations/${invocationId}/actions/${actionId}/resolve-authentication`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function postInvocation({
  workspaceId,
  functionIdOrSlug,
  body = {},
}: {
  workspaceId: string;
  functionIdOrSlug: string;
  body?: unknown;
}) {
  const encodedFunctionIdOrSlug = encodeURIComponent(functionIdOrSlug);

  return honoApp.request(
    `/api/w/${workspaceId}/sandbox-functions/${encodedFunctionIdOrSlug}/invocations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function mockInvocationEventStream(events: SandboxFunctionInvocationEvent[]) {
  vi.mocked(getSandboxFunctionInvocationEvents).mockImplementation(
    async function* () {
      for (const [index, data] of events.entries()) {
        yield { eventId: `event-${index}`, data };
      }
    }
  );
}

describe("POST /api/w/:wId/sandbox-functions/:functionIdOrSlug/invocations", () => {
  it("invokes the active Frame publication with only frames_v2 enabled", async () => {
    const { workspace, frame, sandboxFunction } = await setupFrameV2Function();

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
      body: { input: { message: "hello" } },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.invocation).toMatchObject({
      functionId: sandboxFunction.sId,
      status: "created",
    });
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      {
        sandboxFunction: expect.objectContaining({
          sId: sandboxFunction.sId,
          publicationId: "publication-1",
        }),
        invocation: expect.objectContaining({
          sId: body.invocation.sId,
          origin: "interactive_session",
        }),
      }
    );
  });

  it("invokes a Frame from a standalone conversation", async () => {
    const { workspace, frame, sandboxFunction } = await setupFrameV2Function({
      standalone: true,
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
      body: { input: { message: "hello" } },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      invocation: {
        functionId: sandboxFunction.sId,
        status: "created",
      },
    });
  });

  it("allows a standalone conversation author to invoke a frame-author-required function", async () => {
    const { workspace, frame } = await setupFrameV2Function({
      standalone: true,
      userIdentity: "frame_author_required",
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
    });

    expect(response.status).toBe(201);
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
  });

  it("allows a Pod source writer to invoke a frame-author-required function", async () => {
    const { workspace, frame } = await setupFrameV2Function({
      addCallerToSpace: true,
      userIdentity: "frame_author_required",
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
    });

    expect(response.status).toBe(201);
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
  });

  it("denies a readable Pod user who cannot write a frame-author-required function's source", async () => {
    const { adminAuth, workspace, frame, space } = await setupFrameV2Function({
      userIdentity: "frame_author_required",
    });
    const globalGroupResult =
      await GroupResource.fetchWorkspaceGlobalGroup(adminAuth);
    expect(globalGroupResult.isOk()).toBe(true);
    if (globalGroupResult.isOk()) {
      await SpaceFactory.attachGroup(space, globalGroupResult.value);
    }

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
    });

    expect(response.status).toBe(401);
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
  });

  it("denies frame-author-required invocation when the source path is missing", async () => {
    const { workspace, frame, sandboxFunction } = await setupFrameV2Function({
      standalone: true,
      userIdentity: "frame_author_required",
      withSourcePath: false,
    });
    expect(sandboxFunction.userIdentity).toBe("frame_author_required");

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
    });

    expect(response.status).toBe(401);
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
  });

  it("keeps an in-flight Frame invocation streamable after a new publication activates", async () => {
    const { adminAuth, workspace, frame, sandboxFunction } =
      await setupFrameV2Function();
    const invocationResponse = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
    });
    expect(invocationResponse.status).toBe(201);
    const { invocation } = await invocationResponse.json();

    const nextPublicationId = "publication-2";
    await createFramePublicationFunction({
      adminAuth,
      frame,
      publicationId: nextPublicationId,
    });
    await frame.setActiveFramePublication({
      publicationId: nextPublicationId,
      name: "Task List",
      description: "Track tasks.",
    });
    const staleInvocation = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });
    expect(staleInvocation.status).toBe(404);
    mockInvocationEventStream([
      {
        type: "sandbox_function_invocation_result",
        created: Date.now(),
        invocationId: invocation.sId,
        functionId: sandboxFunction.sId,
        result: { ok: true },
      },
    ]);

    const response = await honoApp.request(
      `/api/sse/w/${workspace.sId}/sandbox-functions/${sandboxFunction.sId}/invocations/${invocation.sId}/events`
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"result":{"ok":true}');
  });

  it("enforces Frame use rights independently from source access", async () => {
    const { adminAuth, workspace, frame, user } = await setupFrameV2Function({
      shareScope: "emails_only",
    });

    const denied = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
    });
    expect(denied.status).toBe(404);

    await frame.addSharingGrants(adminAuth, { emails: [user.email] });
    const allowed = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
    });
    expect(allowed.status).toBe(201);
  });

  it("requires Frames v2 to be enabled", async () => {
    const { workspace, sandboxFunction } = await setupFrameV2Function({
      withFramesV2FeatureFlag: false,
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        type: "feature_flag_not_found",
        message: "Frames are not enabled for this workspace.",
      },
    });
  });
});

describe("POST /api/w/:wId/sandbox-functions/:functionIdOrSlug/invocations/:invocationId/actions/:actionId/validate-action", () => {
  it("approves a blocked action and launches its workflow", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth } =
      await setupBlockedAction();
    const removeEventSpy = vi
      .spyOn(getRedisHybridManager(), "removeEvent")
      .mockResolvedValue(undefined);

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        adminAuth,
        action.id
      );
    expect(refetched?.status).toBe("running");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledWith(
      expect.anything(),
      { action: expect.objectContaining({ sId: action.sId }) }
    );
    expect(removeEventSpy).toHaveBeenCalledWith(
      expect.any(Function),
      `sandbox-function-invocation-${invocation.sId}`
    );
  });

  it("approves an in-flight Frame action after a new publication activates", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth, frame } =
      await setupBlockedAction();
    if (!frame) {
      throw new Error("Expected a Frame-owned function.");
    }
    await createFramePublicationFunction({
      adminAuth,
      frame,
      publicationId: "publication-2",
    });
    await frame.setActiveFramePublication({
      publicationId: "publication-2",
      name: "Task List",
      description: "Track tasks.",
    });
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledOnce();
  });

  it("rejects a blocked action without launching its workflow", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth } =
      await setupBlockedAction();
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "rejected" },
    });

    expect(response.status).toBe(200);

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        adminAuth,
        action.id
      );
    // The poll endpoint surfaces `denied` as a 403 rejection to the in-sandbox caller.
    expect(refetched?.status).toBe("denied");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).not.toHaveBeenCalled();
  });

  it("marks the action errored when the workflow launch fails", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth } =
      await setupBlockedAction();
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );
    vi.mocked(launchSandboxFunctionToolWorkflow).mockResolvedValueOnce(
      new Err(new Error("temporal unavailable"))
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(500);

    // Compensated to a terminal status instead of hanging `running` with no workflow.
    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        adminAuth,
        action.id
      );
    expect(refetched?.status).toBe("errored");
  });

  it("records an always-approve for low-stake tools", async () => {
    const { workspace, sandboxFunction, invocation, action, view } =
      await setupBlockedAction({ permission: "low" });
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "always_approved" },
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(setUserAlwaysApprovedTool)).toHaveBeenCalledWith(
      expect.anything(),
      {
        mcpServerId: view.mcpServerId,
        functionCallName: "math_operation",
      }
    );
  });

  it("returns action_not_blocked on a second validation", async () => {
    const { workspace, sandboxFunction, invocation, action } =
      await setupBlockedAction();
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const first = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });
    expect(first.status).toBe(200);

    // The client treats this error type as an already-successful validation.
    const second = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });
    expect(second.status).toBe(400);
    expect(await second.json()).toMatchObject({
      error: { type: "action_not_blocked" },
    });
  });

  it("scopes actions to the invocation in the path", async () => {
    const { workspace, sandboxFunction, action, adminAuth } =
      await setupBlockedAction();
    const otherInvocation = await SandboxFunctionInvocationResource.makeNew(
      adminAuth,
      { sandboxFunction, input: undefined }
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: otherInvocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_found" },
    });
  });

  it("returns action_not_blocked for an action that is not awaiting validation", async () => {
    const { workspace, sandboxFunction, invocation, view, adminAuth } =
      await setupBlockedAction();
    const runningAction = await SandboxFunctionMCPActionFactory.create(
      adminAuth,
      { invocation, mcpServerView: view }
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: runningAction.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_blocked" },
    });
  });

  it("hides validation for another user's invocation", async () => {
    const { workspace, sandboxFunction, invocation, action } =
      await setupBlockedAction({ invocationOwnedByOtherMember: true });

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_found" },
    });
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).not.toHaveBeenCalled();
  });

  it("hides validation for a userless invocation", async () => {
    const { workspace, sandboxFunction, invocation, action } =
      await setupBlockedAction({ invocationOwnerless: true });
    expect(invocation.userId).toBeNull();

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_found" },
    });
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).not.toHaveBeenCalled();
  });
});

describe("POST /api/w/:wId/sandbox-functions/:functionIdOrSlug/invocations/:invocationId/actions/:actionId/resolve-authentication", () => {
  it("completes authentication and relaunches the workflow", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth } =
      await setupBlockedAction({
        blockedStatus: "blocked_authentication_required",
      });
    const removeEventSpy = vi
      .spyOn(getRedisHybridManager(), "removeEvent")
      .mockResolvedValue(undefined);

    const response = await postResolveAuthentication({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { outcome: "completed" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        adminAuth,
        action.id
      );
    expect(refetched?.status).toBe("running");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledWith(
      expect.anything(),
      { action: expect.objectContaining({ sId: action.sId }) }
    );
    expect(removeEventSpy).toHaveBeenCalledWith(
      expect.any(Function),
      `sandbox-function-invocation-${invocation.sId}`
    );
  });

  it("resolves an in-flight Frame authentication after a new publication activates", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth, frame } =
      await setupBlockedAction({
        blockedStatus: "blocked_authentication_required",
      });
    if (!frame) {
      throw new Error("Expected a Frame-owned function.");
    }
    await createFramePublicationFunction({
      adminAuth,
      frame,
      publicationId: "publication-2",
    });
    await frame.setActiveFramePublication({
      publicationId: "publication-2",
      name: "Task List",
      description: "Track tasks.",
    });
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const response = await postResolveAuthentication({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { outcome: "completed" },
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledOnce();
  });

  it("denies authentication without relaunching the workflow", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth } =
      await setupBlockedAction({
        blockedStatus: "blocked_authentication_required",
      });
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const response = await postResolveAuthentication({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { outcome: "denied" },
    });

    expect(response.status).toBe(200);

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        adminAuth,
        action.id
      );
    // The poll endpoint surfaces `denied` as a 403 rejection to the in-sandbox caller.
    expect(refetched?.status).toBe("denied");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).not.toHaveBeenCalled();
  });

  it("marks the action errored when the workflow relaunch fails", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth } =
      await setupBlockedAction({
        blockedStatus: "blocked_authentication_required",
      });
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );
    vi.mocked(launchSandboxFunctionToolWorkflow).mockResolvedValueOnce(
      new Err(new Error("temporal unavailable"))
    );

    const response = await postResolveAuthentication({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { outcome: "completed" },
    });

    expect(response.status).toBe(500);

    // Compensated to a terminal status instead of hanging `running` with no workflow.
    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        adminAuth,
        action.id
      );
    expect(refetched?.status).toBe("errored");
  });

  it("returns action_not_blocked when the action is not awaiting authentication", async () => {
    // A validation-blocked action is not an authentication block.
    const { workspace, sandboxFunction, invocation, action } =
      await setupBlockedAction();
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const response = await postResolveAuthentication({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { outcome: "completed" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_blocked" },
    });
  });

  it("scopes actions to the invocation in the path", async () => {
    const { workspace, sandboxFunction, action, adminAuth } =
      await setupBlockedAction({
        blockedStatus: "blocked_authentication_required",
      });
    const otherInvocation = await SandboxFunctionInvocationResource.makeNew(
      adminAuth,
      { sandboxFunction, input: undefined }
    );

    const response = await postResolveAuthentication({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: otherInvocation.sId,
      actionId: action.sId,
      body: { outcome: "completed" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_found" },
    });
  });

  it("hides authentication resolution for another user's invocation", async () => {
    const { workspace, sandboxFunction, invocation, action } =
      await setupBlockedAction({
        blockedStatus: "blocked_authentication_required",
        invocationOwnedByOtherMember: true,
      });

    const response = await postResolveAuthentication({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { outcome: "completed" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_found" },
    });
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).not.toHaveBeenCalled();
  });

  it("hides authentication resolution for a userless invocation", async () => {
    const { workspace, sandboxFunction, invocation, action } =
      await setupBlockedAction({
        blockedStatus: "blocked_authentication_required",
        invocationOwnerless: true,
      });
    expect(invocation.userId).toBeNull();

    const response = await postResolveAuthentication({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { outcome: "completed" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_found" },
    });
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).not.toHaveBeenCalled();
  });
});
