import type { BlockedToolExecution } from "@app/lib/actions/mcp";
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
let blockedActionsMock: BlockedToolExecution[] = [];

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
};

function makeAuthBlockedAction(
  actionId: string
): BlockedToolExecution & { status: "blocked_authentication_required" } {
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

function Consumer() {
  const { getFirstBlockedActionForMessage, removeCompletedAction } =
    useBlockedActionsContext();

  const firstAction = getFirstBlockedActionForMessage("msg_1");

  return (
    <div>
      <span data-testid="first-action">{firstAction?.actionId ?? "none"}</span>
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

  it("revalidates the blocked actions cache when an action is resolved", async () => {
    const user = userEvent.setup();
    blockedActionsMock = [makeAuthBlockedAction("action_1")];

    renderProvider();

    await user.click(screen.getByRole("button", { name: "resolve" }));

    expect(screen.getByTestId("first-action")).toHaveTextContent("none");
    expect(mutateBlockedActionsMock).toHaveBeenCalledTimes(1);
  });
});
