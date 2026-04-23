import { InlineActivitySteps } from "@app/components/assistant/conversation/actions/inline/InlineActivitySteps";
import type { LightAgentMessageType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/components/assistant/AgentMessageMarkdown", () => ({
  AgentMessageMarkdown: ({ content }: { content: string }) =>
    React.createElement("div", null, content),
}));

vi.mock(
  "@app/components/assistant/conversation/actions/inline/ThinkingStep",
  () => ({
    ThinkingStep: ({ content }: { content: string }) =>
      React.createElement("div", null, content),
  })
);

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => ({
      openPanel: vi.fn(),
    }),
  })
);

vi.mock("@virtuoso.dev/message-list", () => ({
  useVirtuosoMethods: () => ({
    data: { findIndex: () => -1 },
    scrollToItem: vi.fn(),
  }),
}));

const mockOwner: WorkspaceType = {
  id: 1,
  sId: "w_test",
  name: "Test Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

const mockAgentMessage: LightAgentMessageType = {
  type: "agent_message",
  sId: "msg_123",
  version: 0,
  rank: 0,
  branchId: null,
  created: Date.now(),
  completedTs: null,
  parentMessageId: "parent_msg_123",
  parentAgentMessageId: null,
  status: "created",
  content: "Live final answer",
  chainOfThought: "",
  error: null,
  visibility: "visible",
  richMentions: [],
  completionDurationMs: null,
  reactions: [],
  configuration: {
    sId: "agent_123",
    name: "dust",
    pictureUrl: "",
    status: "active",
    canRead: true,
  },
  citations: {},
  generatedFiles: [],
  activitySteps: [],
};

describe("InlineActivitySteps", () => {
  it("keeps the live answer visible when collapsing during writing", () => {
    render(
      <InlineActivitySteps
        agentMessage={mockAgentMessage}
        lastAgentStateClassification="writing"
        completedSteps={[
          {
            type: "thinking",
            content: "Historical reasoning step",
            id: "thinking-1",
          },
        ]}
        pendingToolCalls={[]}
        owner={mockOwner}
        isLastMessage
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Thinking/i }));

    expect(screen.getByText("Historical reasoning step")).not.toBeVisible();
    expect(screen.getByText("Live final answer")).toBeVisible();
  });
});
