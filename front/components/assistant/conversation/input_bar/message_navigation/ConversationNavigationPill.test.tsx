import { ConversationNavigationPill } from "@app/components/assistant/conversation/input_bar/message_navigation/ConversationNavigationPill";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("ConversationNavigationPill", () => {
  const props = {
    variant: "floating" as const,
    showStopButton: false,
    showMessageNavigation: true,
    stopButtonLabel: "Stop",
    hasPendingMessages: false,
    pendingAction: null,
    onStopClick: vi.fn(),
    canScrollUp: true,
    canScrollDown: true,
    onScrollUp: vi.fn(),
    onScrollDown: vi.fn(),
    onScrollToResponse: vi.fn(),
  };

  it("uses the same floating geometry and corner radius as main", () => {
    render(<ConversationNavigationPill {...props} responseNavigation="idle" />);
    const up = screen.getByRole("button", { name: "Previous user message" });
    const down = screen.getByRole("button", { name: "Next user message" });
    const pill = up.parentElement?.parentElement;

    // Main uses 24px icon buttons + 4px gap + 4px padding + 1px border:
    // 62×34px while idle, with rounded-xl (12px) corners.
    expect(up).toHaveClass("size-6");
    expect(down).toHaveClass("size-6");
    expect(up.parentElement).toHaveClass("gap-1");
    expect(pill).toHaveClass("gap-1", "p-1", "rounded-xl", "border");
  });

  it("keeps both arrows and the focused down button while an answer streams", () => {
    const onScrollToResponse = vi.fn();
    const onScrollDown = vi.fn();
    const { rerender } = render(
      <ConversationNavigationPill
        {...props}
        onScrollDown={onScrollDown}
        onScrollToResponse={onScrollToResponse}
        responseNavigation="idle"
      />
    );
    const down = screen.getByRole("button", { name: "Next user message" });
    down.focus();

    rerender(
      <ConversationNavigationPill
        {...props}
        onScrollDown={onScrollDown}
        onScrollToResponse={onScrollToResponse}
        showStopButton
        responseNavigation="streaming"
      />
    );
    expect(screen.getByRole("button", { name: "Jump to latest answer" })).toBe(
      down
    );
    expect(down).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Previous user message" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    fireEvent.click(down);
    expect(onScrollToResponse).toHaveBeenCalledOnce();
    expect(onScrollDown).not.toHaveBeenCalled();

    rerender(
      <ConversationNavigationPill
        {...props}
        onScrollDown={onScrollDown}
        onScrollToResponse={onScrollToResponse}
        responseNavigation="ready"
      />
    );
    expect(
      screen.getByRole("button", { name: "Answer ready, go to bottom" })
    ).toBe(down);
    fireEvent.click(down);
    expect(onScrollToResponse).toHaveBeenCalledTimes(2);

    rerender(
      <ConversationNavigationPill
        {...props}
        onScrollDown={onScrollDown}
        onScrollToResponse={onScrollToResponse}
        responseNavigation="idle"
      />
    );
    fireEvent.click(down);
    expect(onScrollDown).toHaveBeenCalledOnce();
  });

  it("keeps Stop, up and answer reachable in compact mode", () => {
    const onStopClick = vi.fn();
    render(
      <ConversationNavigationPill
        {...props}
        variant="compact"
        showStopButton
        onStopClick={onStopClick}
        responseNavigation="streaming"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStopClick).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Previous user message" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Jump to latest answer" })
    ).toBeInTheDocument();
  });

  it("shows a disabled pending action without hiding the navigation arrows", () => {
    render(
      <ConversationNavigationPill
        {...props}
        showStopButton
        stopButtonLabel="Stopping…"
        pendingAction="stop"
        responseNavigation="streaming"
      />
    );
    expect(screen.getByRole("button", { name: "Stopping…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Jump to latest answer" })
    ).toBeEnabled();
  });
});
