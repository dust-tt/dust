import { CreditCostPopover } from "@app/components/assistant/conversation/CreditCostPopover";
import type { AgentMessageConsumptionToolDetails } from "@app/types/assistant/agent_message_consumption";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOpenPanel, mockSidePanelContext, mockUseAgentMessageConsumption } =
  vi.hoisted(() => {
    const mockOpenPanel = vi.fn();
    const mockSidePanelContext: {
      currentPanel: "credits" | undefined;
      openPanel: typeof mockOpenPanel;
    } = {
      currentPanel: undefined,
      openPanel: mockOpenPanel,
    };

    return {
      mockOpenPanel,
      mockSidePanelContext,
      mockUseAgentMessageConsumption: vi.fn(),
    };
  });

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => mockSidePanelContext,
  })
);

vi.mock("@app/hooks/conversations/useAgentMessageConsumption", () => ({
  useAgentMessageConsumption: mockUseAgentMessageConsumption,
}));

vi.mock("@app/components/assistant/conversation/actions/inline/utils", () => ({
  getActionStepIcon: () => () => null,
}));

vi.mock("@app/components/resources/resources_icons", () => ({
  InternalActionIcons: {
    ActionBrainIcon: () => null,
  },
}));

vi.mock("@dust-tt/sparkle", () => ({
  ShapesPlus: () => null,
  Button: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  Chip: ({ label }: { label: string }) => <span>{label}</span>,
  Icon: () => null,
  Plus: () => null,
  PopoverRoot: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onOpenChange?.(true)}>
        Open credit details
      </button>
      {children}
    </div>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ trigger }: { trigger: ReactNode }) => trigger,
}));

const makeTool = (
  toolName: string,
  label: string,
  attributedCredits: number,
  overrides: Partial<AgentMessageConsumptionToolDetails> = {}
): AgentMessageConsumptionToolDetails => ({
  label,
  internalMCPServerName: null,
  toolName,
  callCount: 1,
  attributedCredits,
  directCredits: 0,
  pending: false,
  ...overrides,
});

const defaultProps: ComponentProps<typeof CreditCostPopover> = {
  credits: 10,
  subAgentCredits: 0,
  conversationId: "conversation_test",
  messageId: "message_test",
  workspaceId: "workspace_test",
  trigger: <button type="button">Credit trigger</button>,
};

describe("CreditCostPopover", () => {
  beforeEach(() => {
    mockOpenPanel.mockReset();
    mockSidePanelContext.currentPanel = undefined;
    mockUseAgentMessageConsumption.mockReset();
  });

  it("shows the tool breakdown and opens credit usage", () => {
    mockUseAgentMessageConsumption.mockReturnValue({
      consumption: {
        billedCredits: 12,
        totalBilledCredits: 30,
        details: {
          attributionVersion: 2,
          agentWorkCredits: 4,
          tools: [
            makeTool("run_research", "Run Research agent", 12, {
              internalMCPServerName: "run_agent",
            }),
            makeTool("run_writer", "Run Writer agent", 8, {
              internalMCPServerName: "agent_delegation",
            }),
            makeTool("files", "File tool", 2),
            makeTool("calendar", "Calendar tool", 7.06, { callCount: 2 }),
            makeTool("title", "Title tool", 1),
            makeTool("search", "Search tool", 5),
            makeTool("web", "Web tool", 3),
          ],
        },
      },
      isConsumptionLoading: false,
      mutateConsumption: vi.fn(),
    });

    render(<CreditCostPopover {...defaultProps} subAgentCredits={3} />);

    expect(screen.getByText("Calendar tool")).toBeInTheDocument();
    expect(screen.getByText("7.1 credits")).toBeInTheDocument();
    expect(screen.getByText("Run Research agent")).toBeInTheDocument();
    expect(screen.getByText("Run Writer agent")).toBeInTheDocument();
    expect(screen.queryByText("Search tool")).not.toBeInTheDocument();
    expect(screen.queryByText("Web tool")).not.toBeInTheDocument();
    expect(screen.queryByText("File tool")).not.toBeInTheDocument();
    expect(screen.queryByText("Title tool")).not.toBeInTheDocument();
    expect(screen.getByText("4 other tools")).toBeInTheDocument();
    expect(screen.getByText("4 uses")).toBeInTheDocument();
    expect(screen.getByText("Message consumption")).toBeInTheDocument();
    expect(screen.getByText("Charged")).toBeInTheDocument();
    expect(screen.getByText("30 credits")).toBeInTheDocument();
    expect(screen.getByText("Context and reasoning")).toBeInTheDocument();
    expect(screen.queryByText("Sub-agents")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Credit usage" }));

    expect(mockOpenPanel).toHaveBeenCalledWith({ type: "credits" });
  });

  it("shows an additive breakdown without a separate savings adjustment", () => {
    mockUseAgentMessageConsumption.mockReturnValue({
      consumption: {
        billedCredits: 10,
        details: {
          attributionVersion: 3,
          agentWorkCredits: 3,
          tools: [
            makeTool("search", "Semantic Search", 7, {
              directCredits: 3,
            }),
          ],
        },
      },
      isConsumptionLoading: false,
      mutateConsumption: vi.fn(),
    });

    render(<CreditCostPopover {...defaultProps} />);

    expect(screen.getByText("Message consumption")).toBeInTheDocument();
    expect(screen.queryByText("Saved through reuse")).not.toBeInTheDocument();
    expect(screen.getByText("3 credits")).toBeInTheDocument();
    expect(screen.getByText("7 credits")).toBeInTheDocument();
  });

  it("shows a sub-agent bill in its run-agent tool row", () => {
    mockUseAgentMessageConsumption.mockReturnValue({
      consumption: {
        billedCredits: 20,
        totalBilledCredits: 302,
        details: {
          attributionVersion: 3,
          agentWorkCredits: 5,
          tools: [
            makeTool("run_dust", "Run dust", 295, {
              internalMCPServerName: "run_agent",
              callCount: 4,
            }),
            makeTool("publish", "Publish Frame", 2),
          ],
        },
      },
      isConsumptionLoading: false,
      mutateConsumption: vi.fn(),
    });

    render(<CreditCostPopover {...defaultProps} subAgentCredits={0} />);

    expect(screen.getByText("302 credits")).toBeInTheDocument();
    expect(screen.getByText("Run dust")).toBeInTheDocument();
    expect(screen.getByText("295 credits")).toBeInTheDocument();
    expect(screen.getByText("4 uses")).toBeInTheDocument();
    expect(screen.queryByText("Sub-agents")).not.toBeInTheDocument();
  });

  it("hides the credit usage button when the credits panel is open", () => {
    mockSidePanelContext.currentPanel = "credits";
    mockUseAgentMessageConsumption.mockReturnValue({
      consumption: { billedCredits: 10, details: null },
      isConsumptionLoading: false,
      mutateConsumption: vi.fn(),
    });

    render(<CreditCostPopover {...defaultProps} />);

    expect(
      screen.queryByRole("button", { name: "Credit usage" })
    ).not.toBeInTheDocument();
  });

  it("keeps the exact charge visible when attribution details are unavailable", () => {
    mockUseAgentMessageConsumption.mockReturnValue({
      consumption: { billedCredits: 12, details: null },
      isConsumptionLoading: false,
      mutateConsumption: vi.fn(),
    });

    render(<CreditCostPopover {...defaultProps} />);

    expect(screen.getByText("12 credits")).toBeInTheDocument();
    expect(
      screen.getByText("Detailed explanation unavailable")
    ).toBeInTheDocument();
  });

  it("loads details on first open and revalidates on later opens", () => {
    const mutateConsumption = vi.fn();
    mockUseAgentMessageConsumption.mockReturnValue({
      consumption: undefined,
      isConsumptionLoading: false,
      mutateConsumption,
    });

    render(<CreditCostPopover {...defaultProps} />);

    expect(mockUseAgentMessageConsumption).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true })
    );

    const openButton = screen.getByRole("button", {
      name: "Open credit details",
    });
    fireEvent.click(openButton);

    expect(mockUseAgentMessageConsumption).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false })
    );
    expect(mutateConsumption).not.toHaveBeenCalled();

    fireEvent.click(openButton);

    expect(mutateConsumption).toHaveBeenCalledOnce();
  });
});
