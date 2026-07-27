import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppContentLayout, PAGE_GUTTER_CLASSES } from "./AppContentLayout";
import type { ContentWidthType } from "./AppLayoutContext";
import { AppLayoutProvider, useSetContentWidth } from "./AppLayoutContext";

vi.mock("@dust-tt/sparkle", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

vi.mock("@app/components/dev/devModeConstants", () => ({
  DEV_MODE_ACTIVE: false,
}));

vi.mock("@app/components/navigation/Navigation", () => ({
  Navigation: () => <div data-testid="navigation" />,
}));

vi.mock("@app/components/navigation/TrialBanner", () => ({
  SubscriptionEndBanner: () => null,
}));

vi.mock("@app/components/navigation/DesktopNavigationContext", () => ({
  useDesktopNavigation: () => ({
    isNavigationBarOpen: true,
    setIsNavigationBarOpen: vi.fn(),
  }),
}));

vi.mock("@app/components/command_palette/CommandPalette", () => ({
  CommandPalette: () => null,
}));

vi.mock("@app/components/sparkle/AppLayoutTitle", () => ({
  AppLayoutTitle: () => <div data-testid="app-layout-title" />,
}));

vi.mock("@app/hooks/useAppKeyboardShortcuts", () => ({
  useAppKeyboardShortcuts: () => {},
}));

vi.mock("@app/hooks/useDocumentScrollMode", () => ({
  useDocumentScrollMode: () => {},
}));

vi.mock("@app/hooks/useDocumentTitle", () => ({
  useDocumentTitle: () => {},
}));

vi.mock("@app/hooks/useHashParams", () => ({
  useHashParam: () => [undefined],
}));

const mockedUseIsMobile = vi.fn(() => false);
vi.mock("@app/lib/swr/useIsMobile", () => ({
  useIsMobile: () => mockedUseIsMobile(),
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ featureFlags: [], subscription: null, user: null }),
  useWorkspace: () => ({ sId: "w_test", name: "Test", role: "user" }),
}));

function DeclareWidth({ value }: { value: ContentWidthType }) {
  useSetContentWidth(value);
  return null;
}

function renderShell(contentWidth?: ContentWidthType) {
  return render(
    <AppLayoutProvider>
      {contentWidth && <DeclareWidth value={contentWidth} />}
      <AppContentLayout>
        <div data-testid="page-content" />
      </AppContentLayout>
    </AppLayoutProvider>
  );
}

// The shell-managed width wrapper carries the page gutter; its presence (and
// its max-w-content class) is what distinguishes the archetypes in the DOM.
function getWidthWrapper(): HTMLElement | null {
  const content = screen.getByTestId("page-content");
  return content.parentElement;
}

describe("AppContentLayout", () => {
  it("centered: wraps children in a gutter wrapper capped at max-w-content", () => {
    renderShell("centered");
    const wrapper = getWidthWrapper();
    expect(wrapper?.className).toContain("max-w-content");
    for (const cls of PAGE_GUTTER_CLASSES.split(" ")) {
      expect(wrapper?.className).toContain(cls);
    }
  });

  it("wide: wraps children in the gutter wrapper without a width cap", () => {
    renderShell("wide");
    const wrapper = getWidthWrapper();
    expect(wrapper?.className).not.toContain("max-w-content");
    for (const cls of PAGE_GUTTER_CLASSES.split(" ")) {
      expect(wrapper?.className).toContain(cls);
    }
  });

  it("full: renders children bare, with no gutter and no width cap", () => {
    renderShell("full");
    const wrapper = getWidthWrapper();
    expect(wrapper?.className ?? "").not.toContain("max-w-content");
    expect(wrapper?.className ?? "").not.toContain("px-4");
  });

  it("undefined renders like full (transient compat)", () => {
    renderShell(undefined);
    const wrapper = getWidthWrapper();
    expect(wrapper?.className ?? "").not.toContain("max-w-content");
    expect(wrapper?.className ?? "").not.toContain("px-4");
  });

  describe("undeclared-width dev warning", () => {
    beforeEach(() => {
      // The warn is dev-only; tests run with NODE_ENV=test.
      vi.stubEnv("NODE_ENV", "development");
      vi.useFakeTimers();
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it("warns when contentWidth stays undefined past the delay", () => {
      renderShell(undefined);
      vi.advanceTimersByTime(2000);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("No contentWidth declared")
      );
    });

    it("does not warn when a width is declared", () => {
      renderShell("centered");
      vi.advanceTimersByTime(2000);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("does not warn when a declaration arrives before the delay (lazy page)", () => {
      const { rerender } = renderShell(undefined);
      vi.advanceTimersByTime(500);
      rerender(
        <AppLayoutProvider>
          <DeclareWidth value="centered" />
          <AppContentLayout>
            <div data-testid="page-content" />
          </AppContentLayout>
        </AppLayoutProvider>
      );
      vi.advanceTimersByTime(2000);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
