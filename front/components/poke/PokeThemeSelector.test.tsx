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
      screen.getAllByRole("tab").map((item) => item.getAttribute("aria-label"))
    ).toEqual(["Light theme", "System theme", "Dark theme"]);
    expect(screen.getByRole("tab", { name: "System theme" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await user.click(screen.getByRole("tab", { name: "Light theme" }));

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("light");
    });
    expect(screen.getByRole("tab", { name: "Light theme" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(screen.getByRole("tab", { name: "Dark theme" }));

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("dark");
    });
    expect(screen.getByRole("tab", { name: "Dark theme" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(document.documentElement).toHaveClass("dark");

    await user.click(screen.getByRole("tab", { name: "System theme" }));

    await waitFor(() => {
      expect(localStorage.getItem("theme")).toBe("system");
    });
    expect(screen.getByRole("tab", { name: "System theme" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
