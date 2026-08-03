import { CreditCostSubmenu } from "@app/components/assistant/conversation/CreditCostSubmenu";
import type { AgentMessageConsumptionToolDetails } from "@app/types/assistant/agent_message_consumption";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseAgentMessageConsumption } = vi.hoisted(() => ({
  mockUseAgentMessageConsumption: vi.fn(),
}));

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
  ChevronRight: () => null,
  ShapesPlus: () => null,
  DropdownMenuItem: ({
    label,
    description,
    endComponent,
    disabled,
  }: {
    label: string;
    description?: string;
    endComponent?: ReactNode;
    disabled?: boolean;
  }) => (
    <div data-disabled={disabled || undefined}>
      <span>{label}</span>
      {description && <span>{description}</span>}
      {endComponent && <span>{endComponent}</span>}
    </div>
  ),
  DropdownMenuLabel: ({ label }: { label: string }) => <div>{label}</div>,
  DropdownMenuPortal: ({ children }: { children: ReactNode }) => children,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({
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
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const makeTool = (
  toolName: string,
  label: string,
  grossAttributedCredits: number,
  overrides: Partial<AgentMessageConsumptionToolDetails> = {}
): AgentMessageConsumptionToolDetails => ({
  label,
  internalMCPServerName: null,
  toolName,
  callCount: 1,
  grossAttributedCredits,
  directCredits: 0,
  pending: false,
  ...overrides,
});

const defaultProps: ComponentProps<typeof CreditCostSubmenu> = {
  credits: 10,
  subAgentCredits: 0,
  conversationId: "conversation_test",
  messageId: "message_test",
  workspaceId: "workspace_test",
  isCostLoading: false,
};

describe("CreditCostSubmenu", () => {
  beforeEach(() => {
    mockUseAgentMessageConsumption.mockReset();
  });

  it("shows the three largest tool contributions and groups the remaining tools", () => {
    mockUseAgentMessageConsumption.mockReturnValue({
      consumption: {
        billedCredits: 12,
        details: {
          attributionVersion: 2,
          grossAttributedCredits: 22,
          estimatedCacheSavingsCredits: 2,
          agentWorkCredits: 4,
          tools: [
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

    render(<CreditCostSubmenu {...defaultProps} subAgentCredits={3} />);

    expect(screen.getByText("Calendar tool")).toBeInTheDocument();
    expect(screen.getByText("7.1 credits")).toBeInTheDocument();
    expect(screen.getByText("Search tool")).toBeInTheDocument();
    expect(screen.getByText("Web tool")).toBeInTheDocument();
    expect(screen.queryByText("File tool")).not.toBeInTheDocument();
    expect(screen.queryByText("Title tool")).not.toBeInTheDocument();
    expect(screen.getByText("Other tools")).toBeInTheDocument();
    expect(screen.getByText("2 tools, 2 uses")).toBeInTheDocument();
    expect(screen.getByText("Saved through reuse")).toBeInTheDocument();
    expect(screen.getByText("Agent work and context")).toBeInTheDocument();
    expect(
      screen.getByText("Longer conversations require more context to process")
    ).toBeInTheDocument();
    expect(screen.getByText("This message")).toBeInTheDocument();
    expect(screen.getByText("Sub-agents")).toBeInTheDocument();
    expect(screen.getByText("Calendar tool").parentElement).toHaveAttribute(
      "data-disabled",
      "true"
    );
  });

  it("keeps the exact charge visible when attribution details are unavailable", () => {
    mockUseAgentMessageConsumption.mockReturnValue({
      consumption: { billedCredits: 12, details: null },
      isConsumptionLoading: false,
      mutateConsumption: vi.fn(),
    });

    render(<CreditCostSubmenu {...defaultProps} />);

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

    render(<CreditCostSubmenu {...defaultProps} />);

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
