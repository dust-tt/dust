import type { LightAgentMessageType } from "@app/types/assistant/conversation";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

import { InlineActivitySteps } from "./InlineActivitySteps";

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => ({
      openPanel: vi.fn(),
    }),
  })
);

vi.mock("@app/components/resources/resources_icons", () => ({
  InternalActionIcons: {},
}));

vi.mock(
  "@app/components/assistant/conversation/actions/inline/TimelineRow",
  () => ({
    TimelineRow: ({
      spinner,
      children,
      isLast,
    }: {
      spinner?: boolean;
      children?: React.ReactNode;
      isLast?: boolean;
    }) => (
      <div
        data-testid="timeline-row"
        data-spinner={spinner ? "true" : "false"}
        data-is-last={isLast ? "true" : "false"}
      >
        {children ?? (spinner ? "loader" : null)}
      </div>
    ),
  })
);

vi.mock("@dust-tt/sparkle", () => ({
  AnimatedText: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  ChatBubbleThoughtIcon: () => null,
  CheckIcon: () => null,
  ChevronRightIcon: () => null,
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
  Icon: () => null,
  Markdown: ({ content }: { content: string }) => <span>{content}</span>,
  ToolsIcon: () => null,
}));

const TEST_AGENT_MESSAGE = {
  type: "agent_message",
  sId: "m_123",
  version: 0,
  rank: 0,
  branchId: null,
  created: 1,
  completedTs: null,
  parentMessageId: "u_123",
  parentAgentMessageId: null,
  status: "created",
  content: null,
  chainOfThought: "",
  error: null,
  visibility: "visible",
  richMentions: [],
  completionDurationMs: null,
  reactions: [],
  configuration: {
    sId: "a_123",
    name: "Test Agent",
    pictureUrl: "",
    status: "active",
    canRead: true,
  },
  citations: {},
  generatedFiles: [],
  activitySteps: [],
} satisfies LightAgentMessageType;

describe("InlineActivitySteps", () => {
  it("renders the trailing loader after pending tool calls", () => {
    render(
      <InlineActivitySteps
        agentMessage={TEST_AGENT_MESSAGE}
        lastAgentStateClassification="thinking"
        completedSteps={[
          { type: "thinking", content: "Existing thought", id: "step_1" },
        ]}
        pendingToolCalls={[
          { toolName: "common_utilities__wait", toolCallId: "call_1" },
        ]}
      />
    );

    const rows = screen.getAllByTestId("timeline-row");

    expect(rows.map((row) => row.textContent)).toEqual([
      "Existing thought",
      "Preparing to Wait...",
      "loader",
    ]);
    expect(rows.at(-1)).toHaveAttribute("data-spinner", "true");
    expect(rows.at(-1)).toHaveAttribute("data-is-last", "true");
  });
});
