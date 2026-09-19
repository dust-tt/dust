import { ToolbarControls } from "@app/components/dev/ToolbarControls";
import { isSseVerbose, setSseVerbose } from "@app/lib/client/sse_verbose";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/components/sparkle/ThemeContext"), () => ({
  useTheme: () => ({ theme: "light", isDark: false, setTheme: vi.fn() }),
}));

vi.mock("@app/components/dev/devFeatureFlagOverrides", () => ({
  getFeatureFlagOverrides: () => ({}),
}));

const metrics = {
  memoryMb: null,
  fps: 60,
  jankPct: 0,
  netRequests: 0,
};

describe("ToolbarControls", () => {
  beforeEach(() => setSseVerbose(false));
  afterEach(() => {
    cleanup();
    setSseVerbose(false);
  });

  it("toggles SSE logs and keeps the choice when switching toolbar mode", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ToolbarControls
        metrics={metrics}
        expanded={null}
        onTogglePanel={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: "SSE Logs" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(isSseVerbose()).toBe(true);

    unmount();
    render(
      <ToolbarControls
        compact
        metrics={metrics}
        expanded={null}
        onTogglePanel={vi.fn()}
      />
    );
    const compactButton = screen.getByRole("button", { name: "SSE" });
    expect(compactButton).toHaveAttribute("aria-pressed", "true");

    await user.click(compactButton);
    expect(isSseVerbose()).toBe(false);
    expect(compactButton).toHaveAttribute("aria-pressed", "false");
  });
});
