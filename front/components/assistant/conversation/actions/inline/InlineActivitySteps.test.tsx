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
      React.createElement("div", { "data-testid": "thinking-step" }, content),
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
  regionalModelsOnly: false,
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
  costCredits: null,
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
  resolvedModel: null,
  modelResolutionMethod: null,
};

describe("InlineActivitySteps", () => {
  it("shows thinking immediately for a placeholder and keeps it visible until writing starts", () => {
    const pendingMessage = {
      ...mockAgentMessage,
      content: null,
      chainOfThought: null,
    };
    const props = {
      agentMessage: pendingMessage,
      completedSteps: [],
      pendingToolCalls: [],
      owner: mockOwner,
      conversationId: "conv-1",
      isLastMessage: true,
    };

    const { rerender } = render(
      <InlineActivitySteps
        {...props}
        lastAgentStateClassification="placeholder"
      />
    );

    const thinkingIndicator = screen.getByRole("button", { name: /Thinking/i });
    expect(thinkingIndicator).toBeVisible();

    rerender(
      <InlineActivitySteps {...props} lastAgentStateClassification="thinking" />
    );

    expect(screen.getByRole("button", { name: /Thinking/i })).toBe(
      thinkingIndicator
    );

    rerender(
      <InlineActivitySteps
        {...props}
        agentMessage={mockAgentMessage}
        lastAgentStateClassification="writing"
      />
    );

    expect(screen.queryByRole("button", { name: /Thinking/i })).toBeNull();
    for (const writingIndicator of screen.getAllByText("Writing…")) {
      expect(writingIndicator).toBeVisible();
    }
    expect(screen.getByText("Live final answer")).toBeVisible();
  });

  it.each([
    "thinking",
    "acting",
  ] as const)("keeps the latest generated text visible while %s", (agentState) => {
    render(
      <InlineActivitySteps
        agentMessage={mockAgentMessage}
        lastAgentStateClassification={agentState}
        completedSteps={[
          {
            type: "thinking",
            content: "Historical reasoning step",
            id: "thinking-1",
          },
        ]}
        pendingToolCalls={[]}
        owner={mockOwner}
        conversationId="conv-1"
        isLastMessage
      />
    );

    expect(screen.getByText("Live final answer")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Thinking/i }));

    expect(screen.getByText("Historical reasoning step")).not.toBeVisible();
    expect(screen.getByText("Live final answer")).toBeVisible();
  });

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
        conversationId="conv-1"
        isLastMessage
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Thinking/i }));

    expect(screen.getByText("Historical reasoning step")).not.toBeVisible();
    expect(screen.getByText("Live final answer")).toBeVisible();
  });

  it("does not render an empty thinking row for whitespace-only streamed reasoning", () => {
    render(
      <InlineActivitySteps
        agentMessage={{ ...mockAgentMessage, chainOfThought: "\n  " }}
        lastAgentStateClassification="thinking"
        completedSteps={[
          {
            type: "thinking",
            content: "Earlier reasoning",
            id: "thinking-1",
          },
        ]}
        pendingToolCalls={[]}
        owner={mockOwner}
        conversationId="conv-1"
        isLastMessage
      />
    );

    expect(screen.getAllByTestId("thinking-step")).toHaveLength(1);
    expect(screen.getByText("Earlier reasoning")).toBeInTheDocument();
  });
});
