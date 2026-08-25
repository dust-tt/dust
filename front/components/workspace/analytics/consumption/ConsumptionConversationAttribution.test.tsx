import { ConsumptionConversationAttribution } from "@app/components/workspace/analytics/consumption/ConsumptionConversationAttribution";
import { getConversationRoute } from "@app/lib/utils/router";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPush, mockUseConsumptionTopConversations } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockUseConsumptionTopConversations: vi.fn(),
}));

vi.mock("@app/hooks/useConsumptionTopConversations", () => ({
  useConsumptionTopConversations: mockUseConsumptionTopConversations,
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({ push: mockPush }),
}));

describe("ConsumptionConversationAttribution", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockUseConsumptionTopConversations.mockReturnValue({
      conversations: [
        {
          conversationId: "conversation-id",
          title: "Quarterly report",
          totalCredits: 42,
        },
      ],
      isTopConversationsLoading: false,
      isTopConversationsError: undefined,
    });
  });

  it("renders labeled columns and opens the selected conversation", () => {
    const onNavigate = vi.fn();

    render(
      <ConsumptionConversationAttribution
        workspaceId="workspace-id"
        period={{ kind: "days", days: 30 }}
        onNavigate={onNavigate}
      />
    );

    expect(
      screen.getByRole("columnheader", { name: "Conversation" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Total Credits" })
    ).toBeInTheDocument();
    expect(screen.getByText("Quarterly report")).toHaveClass("text-sm");

    fireEvent.click(screen.getByText("Quarterly report"));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Open Quarterly report" })
    );

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith(
      getConversationRoute("workspace-id", "conversation-id")
    );
  });
});
