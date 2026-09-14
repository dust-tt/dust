import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BlockedActionsProvider,
  useBlockedActionsContext,
} from "./BlockedActionsProvider";

const mutateBlockedActionsMock = vi.fn();
let blockedActionsMock: AgentLoopBlockedToolExecution[] = [];

vi.mock("@app/lib/swr/blocked_actions", () => ({
  useBlockedActions: () => ({
    blockedActions: blockedActionsMock,
    isLoading: false,
    isError: false,
    mutate: mutateBlockedActionsMock,
  }),
}));

vi.mock("@app/hooks/conversations", () => ({
  useConversations: () => ({
    mutateConversations: vi.fn(),
  }),
}));

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

const conversation: ConversationListItemType = {
  actionRequired: true,
  created: 1,
  hasError: false,
  lastReadMs: null,
  metadata: {},
  requestedSpaceIds: [],
  sId: "conv_1",
  spaceId: null,
  title: "Conversation",
  triggerId: null,
  unread: false,
  updated: 1,
  isRunningAgentLoop: false,
  isParticipant: false,
};

function makeAuthBlockedAction(
  actionId: string
): AgentLoopBlockedToolExecution & {
  status: "blocked_authentication_required";
} {
  return {
    conversationId: "conv_1",
    messageId: "msg_1",
    actionId,
    userId: "user_1",
    configurationId: "config_1",
    created: 1,
    inputs: {},
    status: "blocked_authentication_required",
    metadata: {
      toolName: "tool",
      mcpServerName: "server",
      agentName: "agent",
      mcpServerId: "mcp_1",
      mcpServerDisplayName: "Server",
    },
    authorizationInfo: {
      provider: "salesforce",
      supported_use_cases: [],
    },
  };
}

function makeValidationBlockedAction(
  actionId: string
): AgentLoopBlockedToolExecution & {
  status: "blocked_validation_required";
} {
  const { authorizationInfo: _authorizationInfo, ...action } =
    makeAuthBlockedAction(actionId);

  return {
    ...action,
    status: "blocked_validation_required",
    stake: "low",
    authorizationInfo: null,
  };
}

function Consumer() {
  const {
    getBlockedActionItems,
    getApprovalProgress,
    getFirstBlockedActionForMessage,
    refreshBlockedActions,
    removeCompletedAction,
  } = useBlockedActionsContext();

  const firstAction = getFirstBlockedActionForMessage("msg_1");
  const firstActionItem = getBlockedActionItems("user_1")[0];
  const approvalProgress = firstAction
    ? getApprovalProgress({ actionId: firstAction.actionId, userId: "user_1" })
    : undefined;

  return (
    <div>
      <span data-testid="first-action">{firstAction?.actionId ?? "none"}</span>
      <span data-testid="outer-message-id">
        {firstActionItem?.messageId ?? "none"}
      </span>
      <span data-testid="blocked-message-id">
        {firstActionItem?.blockedAction.messageId ?? "none"}
      </span>
      <span data-testid="approval-progress">
        {approvalProgress
          ? `${approvalProgress.current}/${approvalProgress.total}`
          : "none"}
      </span>
      <button
        type="button"
        onClick={() => {
          if (firstAction) {
            removeCompletedAction(firstAction.actionId);
          }
        }}
      >
        resolve
      </button>
      <button
        type="button"
        onClick={() => {
          void refreshBlockedActions();
        }}
      >
        refresh
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <BlockedActionsProvider owner={owner} conversation={conversation}>
      <Consumer />
    </BlockedActionsProvider>
  );
}

describe("BlockedActionsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blockedActionsMock = [];
  });

  it("advances to the next blocked action when one is resolved", async () => {
    const user = userEvent.setup();
    blockedActionsMock = [
      makeAuthBlockedAction("action_1"),
      makeAuthBlockedAction("action_2"),
    ];

    renderProvider();

    expect(screen.getByTestId("first-action")).toHaveTextContent("action_1");

    await user.click(screen.getByRole("button", { name: "resolve" }));

    expect(screen.getByTestId("first-action")).toHaveTextContent("action_2");
  });

  it("preserves approval progress as actions are resolved", async () => {
    const user = userEvent.setup();
    blockedActionsMock = [
      makeValidationBlockedAction("action_1"),
      makeValidationBlockedAction("action_2"),
      makeValidationBlockedAction("action_3"),
    ];

    const { rerender } = renderProvider();

    expect(screen.getByTestId("approval-progress")).toHaveTextContent("1/3");

    await user.click(screen.getByRole("button", { name: "resolve" }));
    expect(screen.getByTestId("approval-progress")).toHaveTextContent("2/3");

    blockedActionsMock = [
      makeValidationBlockedAction("action_2"),
      makeValidationBlockedAction("action_3"),
    ];
    rerender(
      <BlockedActionsProvider owner={owner} conversation={conversation}>
        <Consumer />
      </BlockedActionsProvider>
    );
    expect(screen.getByTestId("approval-progress")).toHaveTextContent("2/3");

    await user.click(screen.getByRole("button", { name: "resolve" }));
    expect(screen.getByTestId("approval-progress")).toHaveTextContent("3/3");
  });

  it("revalidates the blocked actions cache when an action is resolved", async () => {
    const user = userEvent.setup();
    blockedActionsMock = [makeAuthBlockedAction("action_1")];

    renderProvider();

    await user.click(screen.getByRole("button", { name: "resolve" }));

    expect(screen.getByTestId("first-action")).toHaveTextContent("none");
    expect(mutateBlockedActionsMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes blocked actions on demand", async () => {
    const user = userEvent.setup();

    renderProvider();
    await user.click(screen.getByRole("button", { name: "refresh" }));

    expect(mutateBlockedActionsMock).toHaveBeenCalledTimes(1);
  });

  it("preserves the outer message id for a nested blocked action", () => {
    const childAction = {
      ...makeAuthBlockedAction("action_child"),
      conversationId: "conv_child",
      messageId: "msg_child",
    };
    const parentAction: AgentLoopBlockedToolExecution = {
      ...makeAuthBlockedAction("action_parent"),
      messageId: "msg_parent",
      status: "blocked_child_action_input_required",
      authorizationInfo: null,
      resumeState: null,
      childBlockedActionsList: [childAction],
    };
    blockedActionsMock = [parentAction];

    renderProvider();

    expect(screen.getByTestId("outer-message-id")).toHaveTextContent(
      "msg_parent"
    );
    expect(screen.getByTestId("blocked-message-id")).toHaveTextContent(
      "msg_child"
    );
  });
});
