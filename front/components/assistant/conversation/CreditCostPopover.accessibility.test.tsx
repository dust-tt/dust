import { CreditCostPopover } from "@app/components/assistant/conversation/CreditCostPopover";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseAgentMessageConsumption } = vi.hoisted(() => ({
  mockUseAgentMessageConsumption: vi.fn(),
}));

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => ({ openPanel: vi.fn() }),
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
    ToolsIcon: () => null,
  },
}));

describe("CreditCostPopover accessibility", () => {
  beforeEach(() => {
    mockUseAgentMessageConsumption.mockReturnValue({
      consumption: {
        billedCredits: 10,
        details: {
          attributionVersion: 3,
          agentWorkCredits: 4,
          tools: [],
        },
      },
      isConsumptionLoading: false,
      mutateConsumption: vi.fn(),
    });
  });

  it("opens from the keyboard and restores focus when closed", async () => {
    const user = userEvent.setup();
    render(
      <CreditCostPopover
        credits={10}
        subAgentCredits={0}
        conversationId="conversation_test"
        messageId="message_test"
        workspaceId="workspace_test"
        trigger={
          <button type="button" aria-label="10 credits used. View breakdown">
            10 credits
          </button>
        }
      />
    );

    const trigger = screen.getByRole("button", {
      name: "10 credits used. View breakdown",
    });
    await user.tab();
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("dialog", { name: "Message credits" })
    ).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Message credits" })
      ).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});
