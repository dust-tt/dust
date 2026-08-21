import { PokeThemeSelector } from "@app/components/poke/PokeThemeSelector";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

describe("PokeThemeSelector", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("selects and persists the Poke theme", async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <PokeThemeSelector />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("button", { name: "Theme: System" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Theme: System" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("light");
    });
    expect(
      screen.getByRole("button", { name: "Theme: Light" })
    ).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "Theme: Light" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("dark");
    });
    expect(
      screen.getByRole("button", { name: "Theme: Dark" })
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "Theme: Dark" }));
    await user.click(screen.getByRole("menuitemradio", { name: "System" }));

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("system");
    });
    expect(
      screen.getByRole("button", { name: "Theme: System" })
    ).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
