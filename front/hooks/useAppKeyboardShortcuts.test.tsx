import { DesktopNavigationProvider } from "@app/components/navigation/DesktopNavigationContext";
import { ThemeProvider, useTheme } from "@app/components/sparkle/ThemeContext";
import { useAppKeyboardShortcuts } from "@app/hooks/useAppKeyboardShortcuts";
import type { LightWorkspaceType } from "@app/types/user";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/components/command_palette/CommandPaletteContext", () => ({
  useCommandPalette: () => ({ open: vi.fn() }),
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({ push: vi.fn() }),
}));

const owner = { sId: "wId", name: "W" } as unknown as LightWorkspaceType;

function Harness() {
  useAppKeyboardShortcuts(owner);
  const { theme, isDark } = useTheme();
  return <div data-testid="theme">{`${theme}:${isDark}`}</div>;
}

function fire(key: string) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );
  });
}

describe("useAppKeyboardShortcuts", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("toggles dark mode on Cmd/Ctrl+Shift+U", () => {
    render(
      <ThemeProvider>
        <DesktopNavigationProvider>
          <Harness />
        </DesktopNavigationProvider>
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme").textContent).toBe("system:false");

    fire("U");
    expect(screen.getByTestId("theme").textContent).toBe("dark:true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fire("u");
    expect(screen.getByTestId("theme").textContent).toBe("light:false");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
