import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Prevent the Temporal agent loop from actually starting.
vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue(new Ok(undefined)),
}));

import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { resolveSandboxChildBlock } from "@app/lib/api/sandbox/sandbox_child_block";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
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
  conversationBranchId: null,
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
    resumeState = null,
    sandboxChildActionInfo,
  }: {
    name: string;
    status: ToolExecutionStatus;
    resumeState?: { execId: string } | null;
    sandboxChildActionInfo?: { parentActionId: string };
  }) {
    const stepContent = await AgentStepContentModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      step: 3,
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
  async function resolveChild(childSId: string, parentSId: string) {
    const child = await AgentMCPActionResource.fetchById(auth, childSId);
    expect(child).not.toBeNull();
    await resolveSandboxChildBlock(auth, {
      action: child!,
      sandboxChildActionInfo: { parentActionId: parentSId },
      agentLoopArgs: AGENT_LOOP_ARGS,
    });
  }

  it("relaunches the parent loop when it is blocked, has an execId, and no sibling is still blocked", async () => {
    const { sId: parentSId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: { execId: "0123456789abcdef" },
    });
    const { sId: childSId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentSId },
    });

    await resolveChild(childSId, parentSId);

    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledWith(
      expect.objectContaining({
        startStep: 3,
        waitForCompletion: true,
        agentLoopArgs: expect.objectContaining({
          agentMessageId: AGENT_LOOP_ARGS.agentMessageId,
          conversationBranchId: AGENT_LOOP_ARGS.conversationBranchId,
          conversationId: AGENT_LOOP_ARGS.conversationId,
          userMessageId: AGENT_LOOP_ARGS.userMessageId,
        }),
      })
    );
    const parent = await AgentMCPActionResource.fetchById(auth, parentSId);
    expect(parent!.status).toBe("ready_allowed_explicitly");
  });

  it("skips relaunch when the parent is not in blocked_child_action_input_required", async () => {
    const { sId: parentSId } = await createAction({
      name: "bash",
      status: "running",
      resumeState: { execId: "0123456789abcdef" },
    });
    const { sId: childSId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentSId },
    });

    await resolveChild(childSId, parentSId);

    expect(vi.mocked(launchAgentLoopWorkflow)).not.toHaveBeenCalled();
  });

  it("skips relaunch when the parent has no execId resumeState", async () => {
    const { sId: parentSId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: null,
    });
    const { sId: childSId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentSId },
    });

    await resolveChild(childSId, parentSId);

    expect(vi.mocked(launchAgentLoopWorkflow)).not.toHaveBeenCalled();
  });

  it("does not defer relaunch because of an unrelated parent's blocked child", async () => {
    // Regression: filtering remaining blocked children across the whole agent
    // message (instead of by parentActionId) would let parent B's child
    // permanently strand parent A's relaunch.
    const { sId: parentASId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: { execId: "aaaabbbbccccdddd" },
    });
    const { sId: childASId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentASId },
    });
    const { sId: parentBSId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: { execId: "1111222233334444" },
    });
    await createAction({
      name: "child_tool",
      status: "blocked_validation_required",
      sandboxChildActionInfo: { parentActionId: parentBSId },
    });

    await resolveChild(childASId, parentASId);

    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledTimes(1);
  });

  it("defers while a sibling of the same parent is still blocked, then relaunches once on the last", async () => {
    // Bash issued `dust call A & dust call B & wait`: two blocked children of
    // the same parent. Resolving A alone must not relaunch — only resolving
    // the last one does.
    const { sId: parentSId } = await createAction({
      name: "bash",
      status: "blocked_child_action_input_required",
      resumeState: { execId: "aaaabbbbccccdddd" },
    });
    const { sId: childASId } = await createAction({
      name: "child_tool",
      status: "ready_allowed_explicitly",
      sandboxChildActionInfo: { parentActionId: parentSId },
    });
    const { action: childB, sId: childBSId } = await createAction({
      name: "child_tool",
      status: "blocked_validation_required",
      sandboxChildActionInfo: { parentActionId: parentSId },
    });

    await resolveChild(childASId, parentSId);
    expect(vi.mocked(launchAgentLoopWorkflow)).not.toHaveBeenCalled();

    await childB.update({ status: "ready_allowed_explicitly" });
    await resolveChild(childBSId, parentSId);
    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledTimes(1);
  });
});
