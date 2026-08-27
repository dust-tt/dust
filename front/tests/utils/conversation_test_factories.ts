import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { createConversation } from "@app/lib/api/assistant/conversation";
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentMessageType,
  LightAgentMessageWithActionsType,
  LightConversationType,
  MessageFeedback,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { UserType } from "@app/types/user";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import { createResourceTest } from "./generic_resource_tests";
import { SpaceFactory } from "./SpaceFactory";

export function makeExtra(
  auth: Authenticator,
  conversation: ConversationResource
): ToolHandlerExtra & { runContext: AgentLoopRunContext } {
  const runContext = {
    contextType: "agent_loop",
    conversation: {
      ...conversation.toJSON(),
      visibility: conversation.visibility,
      owner: auth.getNonNullableWorkspace(),
    },
  } as unknown as AgentLoopRunContext;
  return { auth, runContext } as unknown as ToolHandlerExtra & {
    runContext: AgentLoopRunContext;
  };
}

export async function setupPlainConversation(
  role: "admin" | "user" = "admin"
): Promise<{
  auth: Authenticator;
  conversation: ConversationResource;
}> {
  const { authenticator: auth } = await createResourceTest({ role });
  const conversation = await createConversation(auth, {
    title: "Test",
    visibility: "unlisted",
    spaceId: null,
  });
  return { auth, conversation };
}

export async function setupProjectConversation(
  role: "admin" | "user" = "admin"
): Promise<{
  auth: Authenticator;
  conversation: ConversationResource;
  projectId: string;
}> {
  const { authenticator: auth, workspace } = await createResourceTest({
    role,
  });
  const user = auth.getNonNullableUser();

  const space = await SpaceFactory.project(workspace, user.id);
  const addRes = await space.addMembers(auth, { userIds: [user.sId] });
  assert(addRes.isOk(), "Failed to add user to project space");

  const projectAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const conversation = await createConversation(projectAuth, {
    title: "Test",
    visibility: "unlisted",
    spaceId: space.id,
  });

  return { auth: projectAuth, conversation, projectId: space.sId };
}

function mockUser(username: string): UserType {
  return {
    sId: username,
    id: 0,
    createdAt: 0,
    provider: null,
    username,
    email: "",
    firstName: username,
    lastName: null,
    fullName: username,
    image: null,
    lastLoginAt: null,
  };
}

export function mockUserMessage(
  content: string,
  username: string = "user"
): UserMessageTypeWithContentFragments {
  return {
    id: 0,
    created: 0,
    type: "user_message",
    sId: "",
    visibility: "visible",
    version: 0,
    rank: 0,
    branchId: null,
    user: mockUser(username),
    mentions: [],
    richMentions: [],
    content,
    context: {
      username,
      fullName: username,
      email: null,
      profilePictureUrl: null,
      timezone: "UTC",
      origin: "api",
    },
    reactions: [],
    contentFragments: [],
    requestedModel: null,
  };
}

export function mockAction(params: {
  functionCallName: string;
  status: "succeeded" | "failed";
  params?: Record<string, unknown>;
  userEditedInputs?: Record<string, unknown> | null;
  output?: string | CallToolResult["content"] | null;
  internalMCPServerName?: AgentMCPActionWithOutputType["internalMCPServerName"];
  toolName?: string;
  functionCallId?: string;
  step?: number;
  citationsAllocated?: number;
}): AgentMCPActionWithOutputType {
  const status: ToolExecutionStatus =
    params.status === "succeeded" ? "succeeded" : "errored";
  const output =
    typeof params.output === "string"
      ? [{ type: "text" as const, text: params.output }]
      : (params.output ?? null);
  return {
    id: 0,
    sId: "",
    createdAt: 0,
    updatedAt: 0,
    agentMessageId: 0,
    internalMCPServerName: params.internalMCPServerName ?? null,
    toolName: params.toolName ?? params.functionCallName,
    mcpServerId: null,
    functionCallName: params.functionCallName,
    functionCallId: params.functionCallId ?? "",
    params: params.params ?? {},
    userEditedInputs: params.userEditedInputs ?? null,
    citationsAllocated: params.citationsAllocated ?? 0,
    status,
    step: params.step ?? 0,
    executionDurationMs: null,
    displayLabels: null,
    generatedFiles: [],
    output,
    citations: null,
  };
}

type MockAgentMessageParams = {
  agentName?: string;
  content: string | null;
  actions?: Parameters<typeof mockAction>[0][];
  feedback?: { direction: AgentMessageFeedbackDirection; comment?: string }[];
};

export function mockAgentMessage(
  params: MockAgentMessageParams
): LightAgentMessageWithActionsType & { feedback: MessageFeedback[] } {
  return {
    type: "agent_message",
    sId: "",
    version: 0,
    rank: 0,
    branchId: null,
    created: 0,
    completedTs: null,
    parentMessageId: "",
    parentAgentMessageId: null,
    status: "succeeded",
    content: params.content,
    chainOfThought: null,
    error: null,
    visibility: "visible",
    richMentions: [],
    completionDurationMs: null,
    reactions: [],
    costCredits: null,
    configuration: {
      sId: "",
      name: params.agentName ?? "Agent",
      pictureUrl: "",
      status: "active",
      canRead: true,
    },
    citations: {},
    generatedFiles: [],
    activitySteps: [],
    resolvedModel: null,
    modelResolutionMethod: null,
    actions: (params.actions ?? []).map(mockAction),
    feedback: (params.feedback ?? []).map((f) => ({
      thumbDirection: f.direction,
      content: f.comment ?? null,
    })),
  };
}

type MockFullAgentMessageParams = {
  id?: ModelId;
  agentMessageId?: ModelId;
  sId?: string;
  parentMessageId?: string;
  content?: string | null;
  // Unlike mockAgentMessage's stubbed configuration, AgentMessageType.configuration is the full
  // LightAgentConfigurationType (model, instructions, tags, etc.), so there's no sensible stub to
  // default to here: pass the real agent configuration (e.g. from AgentConfigurationFactory).
  configuration: AgentMessageType["configuration"];
  actions?: Parameters<typeof mockAction>[0][];
  // Defaults to one function_call content per action, mirroring its functionCallId/
  // functionCallName/params. Override only when a test needs to exercise contents that diverge
  // from the actions (e.g. error or cross-provider reasoning content).
  contents?: AgentMessageType["contents"];
};

// Full AgentMessageType, as consumed by getSteps. Unlike mockAgentMessage (the light variant used
// for streaming/reconstruction tests), this includes the id/agentMessageId/contents fields getSteps
// actually reads.
export function mockFullAgentMessage(
  params: MockFullAgentMessageParams
): AgentMessageType {
  const actions = (params.actions ?? []).map(mockAction);

  return {
    id: params.id ?? 1,
    agentMessageId: params.agentMessageId ?? 1,
    type: "agent_message",
    sId: params.sId ?? "agent_msg_1",
    version: 1,
    rank: 1,
    branchId: null,
    created: 0,
    completedTs: null,
    parentMessageId: params.parentMessageId ?? "user_msg_1",
    parentAgentMessageId: null,
    status: "succeeded",
    content: params.content ?? null,
    chainOfThought: null,
    error: null,
    visibility: "visible",
    configuration: params.configuration,
    skipToolsValidation: false,
    actions,
    contents:
      params.contents ??
      actions.map((action) => ({
        step: action.step,
        content: {
          type: "function_call" as const,
          value: {
            id: action.functionCallId,
            name: action.functionCallName,
            arguments: JSON.stringify(action.params),
          },
        },
      })),
    modelInteractionDurationMs: null,
    resolvedModel: null,
    modelResolutionMethod: null,
    richMentions: [],
    completionDurationMs: null,
    reactions: [],
    costCredits: null,
  };
}

export function mockConversation(
  messages: (
    | LightAgentMessageWithActionsType
    | UserMessageTypeWithContentFragments
  )[]
): LightConversationType {
  return {
    id: 0,
    created: 0,
    updated: 0,
    unread: false,
    lastReadMs: null,
    actionRequired: false,
    hasError: false,
    sId: "",
    title: null,
    spaceId: null,
    triggerId: null,
    depth: 0,
    metadata: {},
    requestedSpaceIds: [],
    owner: {
      id: 0,
      sId: "",
      name: "",
      role: "user",
      segmentation: null,
      whiteListedProviders: null,
      defaultEmbeddingProvider: null,
      sharingPolicy: "workspace_only",
      metronomeCustomerId: null,
      regionalModelsOnly: false,
    },
    visibility: "unlisted",
    content: messages,
    isRunningAgentLoop: false,
    isParticipant: false,
  };
}
