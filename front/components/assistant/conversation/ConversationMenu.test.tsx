import { useConversationMenu } from "@app/components/assistant/conversation/ConversationMenu";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function ConversationMenuHarness() {
  const {
    isMenuOpen,
    handleRightClick,
    handleRightPointerDown,
    handleMenuPhaseChange,
  } = useConversationMenu();

  return (
    <div
      data-testid="conversation-row"
      data-menu-open={isMenuOpen}
      onPointerDownCapture={handleRightPointerDown}
      onContextMenu={handleRightClick}
    >
      <button
        type="button"
        onClick={() => {
          handleMenuPhaseChange("closing");
          handleMenuPhaseChange("closed");
        }}
      >
        Close menu
      </button>
    </div>
  );
}

describe("useConversationMenu", () => {
  it("does not reopen from the right-click gesture that closed the menu", () => {
    render(<ConversationMenuHarness />);
    const conversationRow = screen.getByTestId("conversation-row");

    fireEvent.contextMenu(conversationRow);
    expect(conversationRow).toHaveAttribute("data-menu-open", "true");

    const pointerDown = createEvent.pointerDown(conversationRow);
    Object.defineProperty(pointerDown, "button", { value: 2 });
    fireEvent(conversationRow, pointerDown);
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    fireEvent.contextMenu(conversationRow);

    expect(conversationRow).toHaveAttribute("data-menu-open", "false");

    fireEvent.contextMenu(conversationRow);
    expect(conversationRow).toHaveAttribute("data-menu-open", "true");
  });
});
