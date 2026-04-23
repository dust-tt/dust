import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

import { CompactionMessage } from "./CompactionMessage";

vi.mock("@app/lib/utils/timestamps", () => ({
  formatTimestring: () => "now",
}));

vi.mock("@dust-tt/sparkle", () => ({
  AnimatedText: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
  ContentMessage: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div>
      <div>{title}</div>
      <div>{children}</div>
    </div>
  ),
  ExclamationCircleIcon: "ExclamationCircleIcon",
  Spinner: () => <div>spinner</div>,
}));

describe("CompactionMessage", () => {
  const baseConversation = {
    actionRequired: false,
    branchId: null,
    created: 0,
    depth: 1,
    hasError: false,
    id: 1,
    lastReadMs: null,
    metadata: {},
    requestedSpaceIds: [],
    sId: "conv_child",
    spaceId: null,
    title: null,
    triggerId: null,
    unread: false,
    updated: 0,
  };

  const baseMessage = {
    type: "compaction_message" as const,
    id: 1,
    compactionMessageId: 1,
    sId: "msg_1",
    created: 0,
    visibility: "visible" as const,
    version: 0,
    rank: 0,
    branchId: null,
    status: "succeeded" as const,
    content: "summary",
  };

  it("renders the default label for same-conversation compactions", () => {
    render(
      <CompactionMessage
        message={baseMessage}
        conversation={baseConversation}
      />
    );

    expect(screen.getByText("Context compacted · now")).toBeInTheDocument();
  });

  it("renders the parent conversation title for fork compactions", () => {
    render(
      <CompactionMessage
        message={{
          ...baseMessage,
          sourceConversationId: "conv_parent",
        }}
        conversation={{
          ...baseConversation,
          forkingData: {
            forkedFrom: {
              parentConversationId: "conv_parent",
              parentConversationTitle: "Parent conversation",
              sourceMessageId: "msg_parent",
              branchedAt: 0,
              user: {
                sId: "usr_1",
                id: 1,
                createdAt: 0,
                provider: null,
                username: "alice",
                email: "alice@example.com",
                firstName: "Alice",
                lastName: null,
                fullName: "Alice",
                image: null,
                lastLoginAt: null,
              },
            },
          },
        }}
      />
    );

    expect(
      screen.getByText(
        "Summary context gathered from conversation 'Parent conversation' · now"
      )
    ).toBeInTheDocument();
  });
});
