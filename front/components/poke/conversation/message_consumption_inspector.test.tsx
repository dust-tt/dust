import { PokeMessageConsumptionInspector } from "@app/components/poke/conversation/message_consumption_inspector";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUsePokeMessageConsumption } = vi.hoisted(() => ({
  mockUsePokeMessageConsumption: vi.fn(),
}));

vi.mock("@app/components/sparkle/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("@app/components/providers/types", () => ({
  getModelLogoByModelId: () => undefined,
}));

vi.mock("@app/components/assistant/conversation/actions/inline/utils", () => ({
  getActionStepIcon: () => undefined,
}));

vi.mock("@app/poke/swr/message_consumption", () => ({
  usePokeMessageConsumption: mockUsePokeMessageConsumption,
}));

const defaultProps: ComponentProps<typeof PokeMessageConsumptionInspector> = {
  billedCredits: 10,
  conversationId: "conversation_test",
  messageId: "message_test",
  subAgentBilledCredits: 20,
  workspaceId: "workspace_test",
};

describe("PokeMessageConsumptionInspector", () => {
  beforeEach(() => {
    mockUsePokeMessageConsumption.mockReset();
    mockUsePokeMessageConsumption.mockReturnValue({
      consumption: undefined,
      isConsumptionError: undefined,
      isConsumptionLoading: false,
    });
  });

  it("shows the authoritative total immediately and loads details on expansion", () => {
    render(<PokeMessageConsumptionInspector {...defaultProps} />);

    expect(screen.getByText("30 credits")).toBeInTheDocument();
    expect(screen.queryByText("Authoritative bill")).not.toBeInTheDocument();
    expect(mockUsePokeMessageConsumption).toHaveBeenLastCalledWith({
      conversationId: "conversation_test",
      disabled: true,
      messageId: "message_test",
      workspaceId: "workspace_test",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand consumption details for message message_test",
      })
    );

    expect(mockUsePokeMessageConsumption).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false })
    );
    expect(screen.queryByText("Authoritative bill")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Stored charge for this message and its recursive sub-agent tree."
      )
    ).not.toBeInTheDocument();
  });

  it("shows the full model and tool attribution", () => {
    mockUsePokeMessageConsumption.mockReturnValue({
      consumption: {
        billedCredits: 10,
        totalBilledCredits: 30,
        details: {
          attributionVersion: 7,
          agentWorkCredits: 5,
          models: [
            {
              providerId: "openai",
              modelId: "gpt-5-mini",
              displayName: "GPT-5 mini",
              attributedCredits: 10.26,
            },
          ],
          tools: [
            {
              label: "Workspace search",
              internalMCPServerName: "search",
              toolName: "semantic_search",
              callCount: 2,
              attributedCredits: 3.26,
              directCredits: 1.26,
              pending: true,
            },
            {
              label: "Run Research agent",
              internalMCPServerName: "run_agent",
              toolName: "run_research",
              callCount: 1,
              attributedCredits: 21.74,
              directCredits: 2,
              pending: false,
            },
          ],
        },
      },
      isConsumptionError: undefined,
      isConsumptionLoading: false,
    });

    render(<PokeMessageConsumptionInspector {...defaultProps} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand consumption details for message message_test",
      })
    );

    expect(screen.getByText("Direct message by model")).toBeInTheDocument();
    expect(screen.getByText("Attribution")).toBeInTheDocument();
    expect(screen.queryByText("Additive attribution")).not.toBeInTheDocument();
    expect(screen.queryByText("Direct message")).not.toBeInTheDocument();
    expect(screen.queryByText("Sub-agent tree")).not.toBeInTheDocument();
    expect(screen.queryByText("Explained")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Provider and model mix for the originating message.")
    ).not.toBeInTheDocument();
    expect(screen.getByText("GPT-5 mini")).toBeInTheDocument();
    expect(screen.queryByText("openai / gpt-5-mini")).not.toBeInTheDocument();
    expect(screen.getByText("10.3 credits")).toBeInTheDocument();
    expect(screen.getByText("3.3 credits")).toBeInTheDocument();
    expect(screen.getByText("1.3 credits")).toBeInTheDocument();
    expect(screen.getByText("Run Research agent")).toBeInTheDocument();
    expect(screen.getByText("Workspace search")).toBeInTheDocument();
    expect(
      screen.queryByText("Every tool, ranked by its share of the bill.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("search / semantic_search")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("run_agent / run_research")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Attributed credits reconcile the stored bill/)
    ).not.toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Attribution v7")).not.toBeInTheDocument();
    expect(screen.queryByText("v7")).not.toBeInTheDocument();
    expect(screen.queryByText("Reconciled")).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Message credits split between agent work and tools",
      })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Direct tool charge")).toHaveLength(2);
  });

  it("keeps the exact bill visible when detailed attribution is unavailable", () => {
    mockUsePokeMessageConsumption.mockReturnValue({
      consumption: {
        billedCredits: 12,
        totalBilledCredits: 12,
        details: null,
      },
      isConsumptionError: undefined,
      isConsumptionLoading: false,
    });

    render(
      <PokeMessageConsumptionInspector
        {...defaultProps}
        billedCredits={12}
        subAgentBilledCredits={0}
      />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand consumption details for message message_test",
      })
    );

    expect(screen.getAllByText("12 credits")).not.toHaveLength(0);
    expect(
      screen.getByText("Detailed attribution unavailable")
    ).toBeInTheDocument();
  });
});
