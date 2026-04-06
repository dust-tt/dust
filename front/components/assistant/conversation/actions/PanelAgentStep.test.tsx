import type { LightWorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

import { PanelAgentStep } from "./PanelAgentStep";

vi.mock("@app/components/actions/mcp/details/MCPActionDetails", () => ({
  MCPActionDetails: () => <div>mocked-action-details</div>,
}));

vi.mock("@dust-tt/sparkle", () => ({
  ContentMessage: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
  Spinner: () => <div>spinner</div>,
}));

const TEST_OWNER: LightWorkspaceType = {
  id: 1,
  sId: "w_123",
  name: "Test Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  sharingPolicy: "emails_only",
  metronomeCustomerId: null,
};

describe("PanelAgentStep", () => {
  it("renders pending tool calls in the sidebar step", () => {
    render(
      <PanelAgentStep
        stepNumber={1}
        pendingToolCalls={[
          { toolName: "common_utilities__wait", toolCallId: "call_1" },
          { toolName: "data_sources_file_system__list", toolCallIndex: 2 },
        ]}
        streamActionProgress={new Map()}
        owner={TEST_OWNER}
        messageStatus="created"
      />
    );

    expect(
      screen.getByText(
        (_, element) => element?.textContent === "Preparing to Wait..."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent === "Preparing to List data source contents..."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Wait")).toBeInTheDocument();
    expect(screen.getByText("List data source contents")).toBeInTheDocument();
    expect(screen.getByText("spinner")).toBeInTheDocument();
  });
});
