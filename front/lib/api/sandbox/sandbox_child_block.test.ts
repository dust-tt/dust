import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Prevent the Temporal agent loop from actually starting.
vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue(new Ok(undefined)),
}));
vi.mock("@app/lib/resources/conversation_sandbox_adapter", () => ({
  ConversationSandboxAdapter: {
    pauseSandboxForApproval: vi.fn().mockResolvedValue(new Ok(undefined)),
    dangerouslySleepSandboxIfPendingApproval: vi
      .fn()
      .mockResolvedValue(new Ok(undefined)),
  },
}));

import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import {
  finishSandboxBash,
  pauseReservedSandboxBash,
  pauseSandboxBashForBlockedChild,
  persistActionPause,
  reserveSandboxChildRun,
  reserveSandboxParentRun,
  resolveSandboxChildBlock,
} from "@app/lib/api/sandbox/sandbox_child_block";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";

// Only forwarded to launchAgentLoopWorkflow (mocked), so the values are inert.
const AGENT_LOOP_ARGS = {
  agentMessageId: "am-sid",
  agentMessageVersion: 0,
  conversationId: "conv-sid",
  conversationTitle: null,
  userMessageId: "um-sid",
  userMessageVersion: 0,
  userMessageOrigin: "api",
} as const;

describe("resolveSandboxChildBlock", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;
  let agentMessageId: number;
  let stepContentIndex = 0;

  beforeEach(async () => {
    vi.clearAllMocks();
    stepContentIndex = 0;

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });
    const agentMessage = await AgentMessageModel.create({
      conversationId: conversation.id,
      workspaceId: workspace.id,
      status: "created",
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: 0,
      skipToolsValidation: false,
    });
    agentMessageId = agentMessage.id;
  });

  function makeToolConfig(name: string): LightMCPToolConfigurationType {
    return {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name,
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: "test-server-view",
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      internalMCPServerId: null,
      availability: "auto",
      permission: "low",
      toolServerId: "test-server",
      retryPolicy: "no_retry",
      originalName: name,
      mcpServerName: "sandbox",
    };
  }

  // Creates an MCP action (+ its step content + tool-execution join) anchored
  // on the shared agent message and step. `sandboxChildActionInfo` marks it as
  // a sandbox child of the given parent.
  async function createAction({
    name,
    status,
    step = 3,
    resumeState = null,
    sandboxChildActionInfo,
  }: {
    name: string;
    status: ToolExecutionStatus;
    step?: number;
    resumeState?: { execId: string } | null;
    sandboxChildActionInfo?: { parentActionId: string; execId?: string };
  }) {
    const stepContent = await AgentStepContentModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      step,
      index: stepContentIndex++,
      version: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: { id: generateRandomModelSId(), name, arguments: "{}" },
      },
    });

    const action = await AgentMCPActionModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      mcpServerConfigurationId: generateRandomModelSId(),
      status,
      citationsAllocated: 0,
      augmentedInputs: {},
      toolConfiguration: makeToolConfig(name),
      stepContentId: stepContent.id,
      stepContext: {
        citationsCount: 0,
        citationsOffset: 0,
        resumeState,
        retrievalTopK: 10,
        websearchResultCount: 5,
        ...(sandboxChildActionInfo ? { sandboxChildActionInfo } : {}),
      },
    });
    await AgentStepContentToolExecutionModel.create({
      workspaceId: workspace.id,
      conversationId: conversation.id,
      agentMessageId,
      agentMCPActionId: action.id,
      stepContentId: stepContent.id,
    });

    const sId = AgentMCPActionResource.modelIdToSId({
      id: action.id,
      workspaceId: workspace.id,
    });
    return { action, sId };
  }

  // Invokes the function under test against an already-resolved child. Mirrors
  // the callers, which transition the child out of `blocked_*` before calling.
  async function resolveChild(childId: string, parentId: string) {
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    expect(child).not.toBeNull();
    await resolveSandboxChildBlock(auth, {
      action: child!,
      sandboxChildActionInfo: { parentActionId: parentId },
      agentLoopArgs: {
        ...AGENT_LOOP_ARGS,
        conversationId: conversation.sId,
      },
    });
  }

  it("relaunches the parent loop when it is blocked, has an execId, and no sibling is still blocked", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: { execId: "0123456789abcdef" },
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentId },
    });

    await resolveChild(childId, parentId);

    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledWith(
      expect.objectContaining({
        startStep: 3,
        waitForCompletion: true,
        agentLoopArgs: expect.objectContaining({
          agentMessageId: AGENT_LOOP_ARGS.agentMessageId,
          conversationId: conversation.sId,
          userMessageId: AGENT_LOOP_ARGS.userMessageId,
        }),
      })
    );
    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    expect(parent!.status).toBe("ready_allowed_explicitly");
  });

  it("denies a late blocked child without re-blocking a finished parent", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "succeeded",
      step: 1,
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "blocked_validation_required",
      step: 1,
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const { sId: currentActionId } = await createAction({
      name: "current_tool",
      status: "blocked_validation_required",
      step: 3,
    });
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    if (!child) {
      throw new Error("Expected the child action to exist.");
    }

    await pauseSandboxBashForBlockedChild(
      auth,
      child,
      conversation,
      AGENT_LOOP_ARGS
    );

    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    const deniedChild = await AgentMCPActionResource.fetchById(auth, childId);
    expect(parent?.status).toBe("succeeded");
    expect(deniedChild?.status).toBe("denied");
    await expect(
      AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
        agentMessageId,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        sId: currentActionId,
      }),
    ]);
    expect(
      vi.mocked(ConversationSandboxAdapter.pauseSandboxForApproval)
    ).not.toHaveBeenCalled();
  });

  it("denies a child that blocks after its message was cancelled", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "running",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "blocked_user_answer_required",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: agentMessageId,
      status: "cancelled",
    });
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    if (!child) {
      throw new Error("Expected the child action to exist.");
    }

    const accepted = await pauseSandboxBashForBlockedChild(
      auth,
      child,
      conversation,
      AGENT_LOOP_ARGS
    );

    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    const deniedChild = await AgentMCPActionResource.fetchById(auth, childId);
    expect(accepted).toBe(false);
    expect(parent?.status).toBe("running");
    expect(deniedChild?.status).toBe("denied");
    expect(
      vi.mocked(ConversationSandboxAdapter.pauseSandboxForApproval)
    ).not.toHaveBeenCalled();
  });

  it("persists the execId before pausing the sandbox", async () => {
    const execId = "0123456789abcdef";
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "running",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "blocked_validation_required",
      sandboxChildActionInfo: { parentActionId: parentId, execId },
    });
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    if (!child) {
      throw new Error("Expected the child action to exist.");
    }
    vi.mocked(
      ConversationSandboxAdapter.pauseSandboxForApproval
    ).mockImplementationOnce(async (_auth, _conversation, opts) => {
      const shouldPause = opts?.shouldPause;
      if (!shouldPause) {
        throw new Error("Expected a pause condition.");
      }
      expect(await shouldPause()).toBe(true);
      return new Ok(undefined);
    });

    const accepted = await pauseSandboxBashForBlockedChild(
      auth,
      child,
      conversation,
      AGENT_LOOP_ARGS
    );

    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    expect(accepted).toBe(true);
    expect(parent?.stepContext.resumeState).toEqual({ execId });
  });

  it("rechecks the child after acquiring the sandbox lifecycle lock", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "running",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "blocked_validation_required",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    if (!child) {
      throw new Error("Expected the child action to exist.");
    }
    vi.mocked(
      ConversationSandboxAdapter.pauseSandboxForApproval
    ).mockImplementationOnce(async (_auth, _conversation, opts) => {
      const shouldPause = opts?.shouldPause;
      if (!shouldPause) {
        throw new Error("Expected a pause condition.");
      }
      await ConversationFactory.setAgentMessageStatus({
        workspace,
        agentMessageModelId: agentMessageId,
        status: "cancelled",
      });
      expect(await shouldPause()).toBe(false);
      return new Ok(undefined);
    });

    const accepted = await pauseSandboxBashForBlockedChild(
      auth,
      child,
      conversation,
      AGENT_LOOP_ARGS
    );

    expect(accepted).toBe(false);
    expect(
      vi.mocked(ConversationSandboxAdapter.pauseSandboxForApproval)
    ).toHaveBeenCalledOnce();
  });

  it("denies a ready child when its parent finishes before the child starts", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "running",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_implicitly",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    if (!parent) {
      throw new Error("Expected the parent action to exist.");
    }

    const completed = await finishSandboxBash(auth, {
      action: parent,
      conversation,
      executionDurationMs: 10,
      messageId: AGENT_LOOP_ARGS.agentMessageId,
      status: "succeeded",
    });

    const child = await AgentMCPActionResource.fetchById(auth, childId);
    expect(completed).toBe(true);
    expect(parent.status).toBe("succeeded");
    expect(child?.status).toBe("denied");
  });

  it("finishes the parent when a blocking child arrived after bash returned", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "blocked_validation_required",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    if (!parent) {
      throw new Error("Expected the parent action to exist.");
    }

    const completed = await finishSandboxBash(auth, {
      action: parent,
      conversation,
      executionDurationMs: 10,
      messageId: AGENT_LOOP_ARGS.agentMessageId,
      status: "succeeded",
    });

    const child = await AgentMCPActionResource.fetchById(auth, childId);
    expect(completed).toBe(true);
    expect(parent.status).toBe("succeeded");
    expect(child?.status).toBe("denied");
    expect(
      vi.mocked(
        ConversationSandboxAdapter.dangerouslySleepSandboxIfPendingApproval
      )
    ).toHaveBeenCalledOnce();
  });

  it("denies a pending child when its parent errors", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "running",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "blocked_validation_required",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    if (!parent) {
      throw new Error("Expected the parent action to exist.");
    }

    const completed = await finishSandboxBash(auth, {
      action: parent,
      conversation,
      executionDurationMs: 10,
      messageId: AGENT_LOOP_ARGS.agentMessageId,
      status: "errored",
    });

    const child = await AgentMCPActionResource.fetchById(auth, childId);
    expect(completed).toBe(true);
    expect(parent.status).toBe("errored");
    expect(child?.status).toBe("denied");
  });

  it("does not start a child whose parent already finished", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "succeeded",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_implicitly",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    if (!child) {
      throw new Error("Expected the child action to exist.");
    }

    const reserved = await reserveSandboxChildRun(auth, child, conversation);

    const deniedChild = await AgentMCPActionResource.fetchById(auth, childId);
    expect(reserved).toBeNull();
    expect(deniedChild?.status).toBe("denied");
  });

  it("atomically reserves a child while its parent is running", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "running",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_implicitly",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    if (!child) {
      throw new Error("Expected the child action to exist.");
    }

    const reserved = await reserveSandboxChildRun(auth, child, conversation);

    expect(reserved?.status).toBe("running");
  });

  it("defers a ready child while its parent is blocked", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_implicitly",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    if (!child) {
      throw new Error("Expected the child action to exist.");
    }

    const reserved = await reserveSandboxChildRun(auth, child, conversation);

    const deferredChild = await AgentMCPActionResource.fetchById(auth, childId);
    expect(reserved).toBeNull();
    expect(deferredChild?.status).toBe("ready_allowed_implicitly");
  });

  it("reserves a ready parent and child together", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "ready_allowed_explicitly",
      resumeState: { execId: "0123456789abcdef" },
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    if (!child) {
      throw new Error("Expected the child action to exist.");
    }

    const reserved = await reserveSandboxChildRun(auth, child, conversation);

    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    expect(reserved?.status).toBe("running");
    expect(parent?.status).toBe("running");
  });

  it("denies a resumed parent when cancellation wins", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "ready_allowed_explicitly",
      resumeState: { execId: "0123456789abcdef" },
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: agentMessageId,
      status: "cancelled",
    });
    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    if (!parent) {
      throw new Error("Expected the parent action to exist.");
    }

    const reserved = await reserveSandboxParentRun(auth, parent, conversation);

    const deniedParent = await AgentMCPActionResource.fetchById(auth, parentId);
    expect(reserved).toBeNull();
    expect(deniedParent?.status).toBe("denied");
  });

  it("skips relaunch when the parent is not in blocked_child_action_input_required", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "running",
      resumeState: { execId: "0123456789abcdef" },
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentId },
    });

    await resolveChild(childId, parentId);

    expect(vi.mocked(launchAgentLoopWorkflow)).not.toHaveBeenCalled();
  });

  it("skips relaunch when the parent has no execId resumeState", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: null,
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentId },
    });

    await resolveChild(childId, parentId);

    expect(vi.mocked(launchAgentLoopWorkflow)).not.toHaveBeenCalled();
  });

  it("pauses and relaunches when approval wins before pause", async () => {
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
    });
    const { sId: childId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: {
        parentActionId: parentId,
        execId: "0123456789abcdef",
      },
    });
    const child = await AgentMCPActionResource.fetchById(auth, childId);
    if (!child) {
      throw new Error("Expected the child action to exist.");
    }
    vi.mocked(
      ConversationSandboxAdapter.pauseSandboxForApproval
    ).mockImplementationOnce(async (_auth, _conversation, opts) => {
      const shouldPause = opts?.shouldPause;
      if (!shouldPause) {
        throw new Error("Expected a pause condition.");
      }
      expect(await shouldPause()).toBe(true);
      return new Ok(undefined);
    });

    await resolveChild(childId, parentId);
    await pauseReservedSandboxBash(auth, child, conversation, {
      ...AGENT_LOOP_ARGS,
      conversationId: conversation.sId,
    });

    const parent = await AgentMCPActionResource.fetchById(auth, parentId);
    expect(parent?.stepContext.resumeState).toEqual({
      execId: "0123456789abcdef",
    });
    expect(parent?.status).toBe("ready_allowed_explicitly");
    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledOnce();
  });

  it("does not resurrect a cancelled action from a late pause result", async () => {
    const resumeState = { execId: "0123456789abcdef" };
    const { sId: actionId } = await createAction({
      name: "bash",
      status: "denied",
    });
    const action = await AgentMCPActionResource.fetchById(auth, actionId);
    if (!action) {
      throw new Error("Expected the action to exist.");
    }

    const persisted = await persistActionPause(
      auth,
      action,
      conversation,
      resumeState
    );

    const freshAction = await AgentMCPActionResource.fetchById(auth, actionId);
    expect(persisted).toBe(false);
    expect(freshAction?.status).toBe("denied");
    expect(freshAction?.stepContext.resumeState).toBeNull();
  });

  it("does not defer relaunch because of an unrelated parent's blocked child", async () => {
    // Regression: filtering remaining blocked children across the whole agent
    // message (instead of by parentActionId) would let parent B's child
    // permanently strand parent A's relaunch.
    const { sId: parentAId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: { execId: "aaaabbbbccccdddd" },
    });
    const { sId: childAId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentAId },
    });
    const { sId: parentBId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: { execId: "1111222233334444" },
    });
    await createAction({
      name: "child_tool",
      status: "blocked_validation_required",
      sandboxChildActionInfo: { parentActionId: parentBId },
    });

    await resolveChild(childAId, parentAId);

    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledTimes(1);
  });

  it("defers while a sibling of the same parent is still blocked, then relaunches once on the last", async () => {
    // Bash issued `dust call A & dust call B & wait`: two blocked children of
    // the same parent. Resolving A alone must not relaunch — only resolving
    // the last one does.
    const { sId: parentId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: { execId: "aaaabbbbccccdddd" },
    });
    const { sId: childAId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentId },
    });
    const { action: childB, sId: childBId } = await createAction({
      name: "child_tool",
      status: "blocked_validation_required",
      sandboxChildActionInfo: { parentActionId: parentId },
    });

    await resolveChild(childAId, parentId);
    expect(vi.mocked(launchAgentLoopWorkflow)).not.toHaveBeenCalled();

    await childB.update({ status: "ready_allowed_explicitly" });
    await resolveChild(childBId, parentId);
    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledTimes(1);
  });
});
