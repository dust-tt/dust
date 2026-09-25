import { InputBarMessageNavigation } from "@app/components/assistant/conversation/input_bar/InputBarMessageNavigation";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("InputBarMessageNavigation", () => {
  it("takes readers to the active answer and then to the completed answer", () => {
    const onScrollDown = vi.fn();
    const onScrollToResponse = vi.fn();
    const props = {
      variant: "floating" as const,
      showStopButton: false,
      showMessageNavigation: true,
      stopButtonLabel: "Stop",
      hasPendingMessages: false,
      pendingAction: null,
      onStopClick: vi.fn(),
      canScrollUp: false,
      canScrollDown: true,
      onScrollUp: vi.fn(),
      onScrollDown,
      onScrollToResponse,
    };

    const { rerender } = render(
      <InputBarMessageNavigation {...props} responseNavigation="streaming" />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Go to latest answer" })
    );
    expect(onScrollToResponse).toHaveBeenCalledTimes(1);
    expect(onScrollDown).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Previous user message" })
    ).not.toBeInTheDocument();

    rerender(
      <InputBarMessageNavigation {...props} responseNavigation="ready" />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Answer ready, go to bottom" })
    );
    expect(onScrollToResponse).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", { name: "Previous user message" })
    ).toBeInTheDocument();

    rerender(
      <InputBarMessageNavigation {...props} responseNavigation="idle" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Next user message" }));
    expect(onScrollDown).toHaveBeenCalledTimes(1);
  });

  it("keeps the active answer reachable beside Stop in compact mode", () => {
    const onScrollToResponse = vi.fn();

    render(
      <InputBarMessageNavigation
        variant="compact"
        showStopButton
        showMessageNavigation
        stopButtonLabel="Stop"
        hasPendingMessages={false}
        pendingAction={null}
        onStopClick={vi.fn()}
        canScrollUp={false}
        canScrollDown={false}
        onScrollUp={vi.fn()}
        onScrollDown={vi.fn()}
        responseNavigation="streaming"
        onScrollToResponse={onScrollToResponse}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Go to latest answer" })
    );
    expect(onScrollToResponse).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Previous user message" })
    ).not.toBeInTheDocument();
  });
});
