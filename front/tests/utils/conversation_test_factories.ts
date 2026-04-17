import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  LightAgentMessageWithActionsType,
  LightConversationType,
  MessageFeedback,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import type { UserType } from "@app/types/user";

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
  };
}

export function mockAction(params: {
  functionCallName: string;
  status: "succeeded" | "failed";
  params?: Record<string, unknown>;
  output?: string | null;
}): AgentMCPActionWithOutputType {
  const status: ToolExecutionStatus =
    params.status === "succeeded" ? "succeeded" : "errored";
  return {
    id: 0,
    sId: "",
    createdAt: 0,
    updatedAt: 0,
    agentMessageId: 0,
    internalMCPServerName: null,
    toolName: params.functionCallName,
    mcpServerId: null,
    functionCallName: params.functionCallName,
    functionCallId: "",
    params: params.params ?? {},
    citationsAllocated: 0,
    status,
    step: 0,
    executionDurationMs: null,
    displayLabels: null,
    generatedFiles: [],
    output: params.output ? [{ type: "text", text: params.output }] : null,
    citations: null,
  };
}

export type MockAgentMessageParams = {
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
    actions: (params.actions ?? []).map(mockAction),
    feedback: (params.feedback ?? []).map((f) => ({
      thumbDirection: f.direction,
      content: f.comment ?? null,
    })),
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
    branchId: null,
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
    },
    visibility: "unlisted",
    content: messages,
  };
}
