import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { SandboxFunctionInvocationError } from "@app/lib/api/sandbox_functions/errors";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  SandboxFunctionInvocationEvent,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import type { FileShareScope } from "@app/types/files";
import {
  frameContentType,
  frameV2ContentType,
  sandboxFunctionContentType,
} from "@app/types/files";
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
import {
  getSandboxFunctionInvocationEvents,
  publishSandboxFunctionInvocationEvent,
} from "@app/lib/api/sandbox_functions/events";
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

async function setupSandboxFunction({
  addCallerToSpace = true,
  withSandboxFunctionsFeatureFlag = true,
  userIdentity = "optional",
  slug = "run-function",
}: {
  addCallerToSpace?: boolean;
  withSandboxFunctionsFeatureFlag?: boolean;
  userIdentity?: SandboxFunctionUserIdentityPolicy;
  slug?: string;
} = {}) {
  const { workspace, auth: adminAuth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  if (withSandboxFunctionsFeatureFlag) {
    await FeatureFlagFactory.basic(adminAuth, "sandbox_functions");
  }
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
    slug,
    description: "Run the function.",
    userIdentity,
    inputSchema,
    outputSchema,
  });

  // The second mock request wins the session mock, so requests authenticate as this member.
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
  const callerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  return { workspace, sandboxFunction, adminAuth, callerAuth, space, user };
}

async function createFramePublicationFunction({
  adminAuth,
  frame,
  publicationId,
}: {
  adminAuth: Authenticator;
  frame: Awaited<ReturnType<typeof FileFactory.create>>;
  publicationId: string;
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
            userIdentity: "optional",
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
  featureFlag = "frames_v2",
  standalone = false,
}: {
  shareScope?: FileShareScope;
  featureFlag?: "frames_v2" | "sandbox_functions";
  standalone?: boolean;
} = {}) {
  const { workspace, auth: adminAuth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  await FeatureFlagFactory.basic(adminAuth, featureFlag);
  const space = await SpaceFactory.project(workspace);
  const conversation = standalone
    ? await ConversationFactory.create(adminAuth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
      })
    : null;
  const publicationId = "publication-1";
  const frame = await FileFactory.create(adminAuth, null, {
    contentType: frameV2ContentType,
    fileName: "app.frame.json",
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
  await frame.setShareScope(adminAuth, shareScope);
  const sandboxFunction = await createFramePublicationFunction({
    adminAuth,
    frame,
    publicationId,
  });

  // The last mock request owns the route session.
  const { user } = await createPrivateApiMockRequest({
    role: "user",
    workspace,
  });
  return {
    adminAuth,
    frame,
    sandboxFunction,
    space,
    user,
    workspace,
  };
}

// Creates a Pod app frame in `folderName` shared with the given scope, returning its share token —
// the capability under test.
async function createSharedAppFrame(
  adminAuth: Authenticator,
  {
    workspace,
    space,
    folderName,
    scope = "workspace_and_emails",
    grantEmails,
    owner = null,
  }: {
    workspace: { sId: string };
    space: { sId: string };
    folderName: string;
    scope?: FileShareScope;
    grantEmails?: string[];
    owner?: UserResource | null;
  }
) {
  const frameFile = await FileFactory.create(adminAuth, owner, {
    contentType: frameContentType,
    fileName: `${folderName}.tsx`,
    fileSize: 100,
    status: "ready",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
    mountFilePath: `w/${workspace.sId}/pods/${space.sId}/files/${folderName}/${folderName}.tsx`,
  });
  await frameFile.setShareScope(adminAuth, scope);
  if (grantEmails && grantEmails.length > 0) {
    await frameFile.addSharingGrants(adminAuth, { emails: grantEmails });
  }
  const shareInfo = await frameFile.getShareInfo();
  if (!shareInfo) {
    throw new Error("Expected the frame share to exist.");
  }
  return shareInfo.shareUrl.split("/").at(-1)!;
}

// Builds a blocked action awaiting validation, the state spolu's creation gate produces for
// approval-requiring tools (created without a workflow launch).
async function setupFunctionForBlockedAction(functionOwner: "pod" | "frame") {
  if (functionOwner === "frame") {
    const setup = await setupFrameV2Function();
    const callerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      setup.user.sId,
      setup.workspace.sId
    );
    return { ...setup, callerAuth };
  }

  return { ...(await setupSandboxFunction()), frame: null };
}

async function setupBlockedAction({
  permission = "high",
  blockedStatus = "blocked_validation_required",
  invocationOwnedByOtherMember = false,
  invocationOwnerless = false,
  functionOwner = "pod",
}: {
  permission?: MCPToolStakeLevelType;
  blockedStatus?:
    | "blocked_validation_required"
    | "blocked_authentication_required";
  invocationOwnedByOtherMember?: boolean;
  invocationOwnerless?: boolean;
  functionOwner?: "pod" | "frame";
} = {}) {
  const { workspace, sandboxFunction, adminAuth, callerAuth, space, frame } =
    await setupFunctionForBlockedAction(functionOwner);

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
  frameShareToken,
}: {
  workspaceId: string;
  functionIdOrSlug: string;
  body?: unknown;
  frameShareToken?: string;
}) {
  const encodedFunctionIdOrSlug = encodeURIComponent(functionIdOrSlug);

  return honoApp.request(
    `/api/w/${workspaceId}/sandbox-functions/${encodedFunctionIdOrSlug}/invocations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(frameShareToken
          ? { "x-dust-frame-share-token": frameShareToken }
          : {}),
      },
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

function toolApprovalEvent({
  invocationId,
  sandboxFunctionId,
}: {
  invocationId: string;
  sandboxFunctionId: string;
}): SandboxFunctionInvocationEvent {
  return {
    type: "tool_approve_execution",
    actionId: "act_blocked",
    created: Date.now(),
    invocationId,
    sandboxFunctionId,
    inputs: {},
    metadata: {
      toolName: "send_email",
      mcpServerName: "gmail",
      agentName: "agent",
    },
  };
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

  it("does not expose Frame functions through the Pod Functions flag", async () => {
    const { workspace, frame, sandboxFunction } = await setupFrameV2Function({
      featureFlag: "sandbox_functions",
    });

    const byReference = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${frame.sId}/run-function`,
    });
    const byId = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(byReference.status).toBe(404);
    expect(byId.status).toBe(404);
  });

  it("does not expose Pod Functions through the Frames v2 flag", async () => {
    const { workspace, sandboxFunction, adminAuth } =
      await setupSandboxFunction({ withSandboxFunctionsFeatureFlag: false });
    await FeatureFlagFactory.basic(adminAuth, "frames_v2");

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(404);
  });

  it("creates an invocation and starts its workflow", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      body: {
        input: { message: "hello" },
        context: { timezone: "Europe/Paris" },
      },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      invocation: expect.objectContaining({
        sId: expect.stringMatching(/^sfi_/),
        functionId: sandboxFunction.sId,
        status: "created",
        createdAt: expect.any(String),
      }),
    });
    const invocation = body.invocation;
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      {
        sandboxFunction: expect.objectContaining({ sId: sandboxFunction.sId }),
        invocation: expect.objectContaining({
          sId: invocation.sId,
          context: { timezone: "Europe/Paris" },
          origin: "interactive_session",
        }),
      }
    );
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      {
        type: "sandbox_function_invocation_created",
        created: Date.parse(invocation.createdAt),
        invocation,
      },
      { invocationId: invocation.sId }
    );
  });

  it("returns the result inline when the invocation succeeds before the response", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    mockInvocationEventStream([
      {
        type: "sandbox_function_invocation_result",
        created: Date.now(),
        invocationId: "sfi_ignored",
        functionId: sandboxFunction.sId,
        result: { ok: true },
      },
    ]);

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.outcome).toEqual({ status: "succeeded", result: { ok: true } });
  });

  it("returns the error inline when the invocation fails before the response", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    mockInvocationEventStream([
      {
        type: "sandbox_function_invocation_error",
        created: Date.now(),
        invocationId: "sfi_ignored",
        functionId: sandboxFunction.sId,
        error: { code: "threw", message: "boom" },
      },
    ]);

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.outcome).toEqual({
      status: "errored",
      error: { code: "threw", message: "boom" },
    });
  });

  // Holding the response until an invocation blocked on user input settles would deadlock: the
  // approval card only renders once the client holds the invocation.
  it("returns no outcome when the invocation blocks on a tool approval", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    mockInvocationEventStream([
      toolApprovalEvent({
        invocationId: "sfi_ignored",
        sandboxFunctionId: sandboxFunction.sId,
      }),
      {
        type: "sandbox_function_invocation_result",
        created: Date.now(),
        invocationId: "sfi_ignored",
        functionId: sandboxFunction.sId,
        result: { ok: true },
      },
    ]);

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.outcome).toBeUndefined();
  });

  it("returns no outcome when the stream ends without settling", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.outcome).toBeUndefined();
    expect(getSandboxFunctionInvocationEvents).toHaveBeenCalled();
  });

  it("allows a workspace member to invoke a workspace-user-required function", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction({
      userIdentity: "workspace_user_required",
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
  });

  it("allows a workspace member's live session to invoke an interactive function", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction({
      userIdentity: "interactive_workspace_user_required",
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
  });

  it("allows a pod member to invoke a pod-member-required function", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction({
      userIdentity: "pod_member_required",
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
  });

  it("denies a workspace member outside an open pod on a pod-member-required function", async () => {
    const { workspace, sandboxFunction, space, adminAuth } =
      await setupSandboxFunction({
        userIdentity: "pod_member_required",
        addCallerToSpace: false,
      });
    // Open the pod so the caller clears the read gate and the policy itself denies (a restricted
    // pod would 404 at fetch before the policy runs).
    const globalGroupResult =
      await GroupResource.fetchWorkspaceGlobalGroup(adminAuth);
    expect(globalGroupResult.isOk()).toBe(true);
    if (globalGroupResult.isOk()) {
      await SpaceFactory.attachGroup(space, globalGroupResult.value);
    }

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: {
        type: "user_authentication_required",
      },
    });
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
  });

  it("records an OAuth invocation as delegated", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    vi.spyOn(Authenticator.prototype, "authMethod").mockReturnValue("oauth");

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        invocation: expect.objectContaining({ origin: "delegated" }),
      })
    );
  });

  it("returns a typed authentication error when the function rejects the caller", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    vi.spyOn(SandboxFunctionResource.prototype, "invoke").mockResolvedValueOnce(
      new Err(
        new SandboxFunctionInvocationError(
          "This Pod Function requires a logged-in user from its workspace."
        )
      )
    );

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: {
        type: "user_authentication_required",
        message:
          "This Pod Function requires a logged-in user from its workspace.",
      },
    });
  });

  it("does not report an unavailable Frame runtime as an authentication error", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    vi.spyOn(SandboxFunctionResource.prototype, "invoke").mockResolvedValueOnce(
      new Err(
        new SandboxFunctionInvocationError(
          "This Frame's runtime scope no longer exists.",
          "frame_runtime_unavailable"
        )
      )
    );

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        type: "frame_runtime_unavailable",
      },
    });
  });

  it("creates an invocation by pod id and function slug", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${sandboxFunction.space.sId}/${sandboxFunction.slug}`,
      body: {
        input: { message: "hello" },
      },
    });

    expect(response.status).toBe(201);
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sandboxFunction: expect.objectContaining({ sId: sandboxFunction.sId }),
        invocation: expect.objectContaining({
          sId: expect.stringMatching(/^sfi_/),
        }),
      })
    );
  });

  it("returns 404 when the user cannot access the function space", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction({
      addCallerToSpace: false,
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "sandbox_function_not_found" },
    });
  });

  describe("frame share token capability", () => {
    it("allows a workspace member outside the pod with the app frame's share token", async () => {
      const { workspace, sandboxFunction, adminAuth, space } =
        await setupSandboxFunction({
          addCallerToSpace: false,
          slug: "tasklist__run",
        });
      const frameShareToken = await createSharedAppFrame(adminAuth, {
        workspace,
        space,
        folderName: "TaskList",
      });

      const response = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: sandboxFunction.sId,
        frameShareToken,
      });

      expect(response.status).toBe(201);
      expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
    });

    it("resolves by pod id and slug with the app frame's share token", async () => {
      const { workspace, sandboxFunction, adminAuth, space } =
        await setupSandboxFunction({
          addCallerToSpace: false,
          slug: "tasklist__run",
        });
      const frameShareToken = await createSharedAppFrame(adminAuth, {
        workspace,
        space,
        folderName: "TaskList",
      });

      const response = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: `${space.sId}/${sandboxFunction.slug}`,
        frameShareToken,
      });

      expect(response.status).toBe(201);
    });

    it("rejects a token from another app's frame in the same pod", async () => {
      const { workspace, sandboxFunction, adminAuth, space } =
        await setupSandboxFunction({
          addCallerToSpace: false,
          slug: "tasklist__run",
        });
      const frameShareToken = await createSharedAppFrame(adminAuth, {
        workspace,
        space,
        folderName: "OtherApp",
      });

      const response = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: sandboxFunction.sId,
        frameShareToken,
      });

      expect(response.status).toBe(404);
      expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    });

    it("allows a workspace member with an email grant on an invite-only frame", async () => {
      const { workspace, sandboxFunction, adminAuth, space, user } =
        await setupSandboxFunction({
          addCallerToSpace: false,
          slug: "tasklist__run",
        });
      const frameShareToken = await createSharedAppFrame(adminAuth, {
        workspace,
        space,
        folderName: "TaskList",
        scope: "emails_only",
        grantEmails: [user.email],
      });

      const response = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: sandboxFunction.sId,
        frameShareToken,
      });

      expect(response.status).toBe(201);
      expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
    });

    it("rejects a token from another pod's frame in the same workspace", async () => {
      const { workspace, sandboxFunction, adminAuth } =
        await setupSandboxFunction({
          addCallerToSpace: false,
          slug: "tasklist__run",
        });
      // A shared frame in a different pod, same folder name: the capability only ever queries
      // its own pod, so both address forms must miss.
      const otherPod = await SpaceFactory.project(workspace);
      const frameShareToken = await createSharedAppFrame(adminAuth, {
        workspace,
        space: otherPod,
        folderName: "TaskList",
      });

      const bySId = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: sandboxFunction.sId,
        frameShareToken,
      });
      expect(bySId.status).toBe(404);

      const bySlug = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: `${sandboxFunction.space.sId}/${sandboxFunction.slug}`,
        frameShareToken,
      });
      expect(bySlug.status).toBe(404);
      expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    });

    it("allows the frame's owner outside the pod on an invite-only frame without a grant", async () => {
      // The view path admits the owner without a grant; invocation mirrors it so that using an
      // app follows viewing its frame exactly.
      const { workspace, sandboxFunction, adminAuth, space, user } =
        await setupSandboxFunction({
          addCallerToSpace: false,
          slug: "tasklist__run",
        });
      const frameShareToken = await createSharedAppFrame(adminAuth, {
        workspace,
        space,
        folderName: "TaskList",
        scope: "emails_only",
        owner: user,
      });

      const response = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: sandboxFunction.sId,
        frameShareToken,
      });

      expect(response.status).toBe(201);
      expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledOnce();
    });

    it("rejects an invite-only token when the caller has no email grant", async () => {
      const { workspace, sandboxFunction, adminAuth, space } =
        await setupSandboxFunction({
          addCallerToSpace: false,
          slug: "tasklist__run",
        });
      const frameShareToken = await createSharedAppFrame(adminAuth, {
        workspace,
        space,
        folderName: "TaskList",
        scope: "emails_only",
      });

      const response = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: sandboxFunction.sId,
        frameShareToken,
      });

      expect(response.status).toBe(404);
      expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    });

    it("rejects a token from another workspace", async () => {
      const { workspace, sandboxFunction } = await setupSandboxFunction({
        addCallerToSpace: false,
        slug: "tasklist__run",
      });
      // A pod app frame with the same folder name, but in a different workspace. Built without
      // createPrivateApiMockRequest so the caller's session mock stays on the first workspace.
      const otherCtx = await createResourceTest({ role: "admin" });
      const otherSpace = await SpaceFactory.project(otherCtx.workspace);
      const foreignToken = await createSharedAppFrame(otherCtx.authenticator, {
        workspace: otherCtx.workspace,
        space: otherSpace,
        folderName: "TaskList",
      });

      const response = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: sandboxFunction.sId,
        frameShareToken: foreignToken,
      });

      expect(response.status).toBe(404);
      expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    });

    it("still applies the pod-member-required policy with a valid token", async () => {
      const { workspace, sandboxFunction, adminAuth, space } =
        await setupSandboxFunction({
          addCallerToSpace: false,
          slug: "tasklist__run",
          userIdentity: "pod_member_required",
        });
      const frameShareToken = await createSharedAppFrame(adminAuth, {
        workspace,
        space,
        folderName: "TaskList",
      });

      const response = await postInvocation({
        workspaceId: workspace.sId,
        functionIdOrSlug: sandboxFunction.sId,
        frameShareToken,
      });

      expect(response.status).toBe(401);
      expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    });
  });

  it("does not require Computer access", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
  });

  it("returns 500 when starting the invocation workflow fails", async () => {
    const { workspace, sandboxFunction, adminAuth } =
      await setupSandboxFunction();
    vi.mocked(launchSandboxFunctionInvocationWorkflow).mockResolvedValueOnce(
      new Err(new Error("temporal unavailable"))
    );

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {
        type: "internal_server_error",
        message: "Sandbox function invocation failed.",
      },
    });
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sandbox_function_invocation_error",
        invocationId: expect.stringMatching(/^sfi_/),
        functionId: sandboxFunction.sId,
        error: {
          code: "invocation_failed",
          message: "temporal unavailable",
        },
      }),
      { invocationId: expect.stringMatching(/^sfi_/) }
    );
    const errorEvent = vi
      .mocked(publishSandboxFunctionInvocationEvent)
      .mock.calls.find(
        ([event]) => event.type === "sandbox_function_invocation_error"
      )?.[0];
    expect(errorEvent?.type).toBe("sandbox_function_invocation_error");
    if (
      !errorEvent ||
      errorEvent.type !== "sandbox_function_invocation_error"
    ) {
      return;
    }
    const invocation = await SandboxFunctionInvocationResource.fetchById(
      adminAuth,
      {
        sandboxFunction,
        invocationId: errorEvent.invocationId,
      }
    );
    expect(invocation?.status).toBe("errored");
  });

  it("requires sandbox functions to be enabled", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction({
      withSandboxFunctionsFeatureFlag: false,
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        type: "feature_flag_not_found",
        message: "Sandbox Functions are not enabled for this workspace.",
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
      await setupBlockedAction({ functionOwner: "frame" });
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
        functionOwner: "frame",
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
