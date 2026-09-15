import { AppContentLayout } from "@app/components/sparkle/AppContentLayout";
import {
  AppLayoutProvider,
  useSetContentWidth,
  useSetHasTitle,
  useSetTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { render } from "@testing-library/react";
import type React from "react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ featureFlags: [], subscription: null, user: null }),
  useWorkspace: () => ({ sId: "wks", name: "Workspace" }),
}));
vi.mock("@app/lib/swr/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@app/components/navigation/DesktopNavigationContext", () => ({
  useDesktopNavigation: () => ({
    isNavigationBarOpen: true,
    setIsNavigationBarOpen: () => {},
  }),
}));
vi.mock("@app/components/navigation/Navigation", () => ({
  Navigation: () => null,
}));
vi.mock("@app/components/navigation/TopBanners", () => ({
  TopBanners: () => null,
}));
vi.mock("@app/components/command_palette/CommandPalette", () => ({
  CommandPalette: () => null,
}));
vi.mock("@app/hooks/useAppKeyboardShortcuts", () => ({
  useAppKeyboardShortcuts: () => {},
}));
vi.mock("@app/hooks/useDocumentScrollMode", () => ({
  useDocumentScrollMode: () => {},
}));
vi.mock("@app/hooks/useDocumentTitle", () => ({ useDocumentTitle: () => {} }));
vi.mock("@app/hooks/useHashParams", () => ({
  useHashParam: () => [undefined, () => {}],
}));

let mountCount = 0;
let unmountCount = 0;

/**
 * Stands in for the route outlet. A remount shows up as a second mount, and an
 * outlet that is torn down without being re-created shows up as an unmount.
 */
function OutletProbe() {
  useEffect(() => {
    mountCount++;
    return () => {
      unmountCount++;
    };
  }, []);
  return <span data-testid="outlet" />;
}

interface LayoutState {
  name: string;
  hasTitle: boolean;
  contentWidth: "centered" | "wide" | undefined;
  title: React.ReactNode;
}

function Page({ hasTitle, contentWidth, title }: Omit<LayoutState, "name">) {
  useSetHasTitle(hasTitle);
  useSetContentWidth(contentWidth);
  useSetTitle(title);
  return <OutletProbe />;
}

function Harness({ state }: { state: Omit<LayoutState, "name"> }) {
  return (
    <AppLayoutProvider>
      <AppContentLayout>
        <Page {...state} />
      </AppContentLayout>
    </AppLayoutProvider>
  );
}

const TITLE_NODE = <h1>title</h1>;

/**
 * The layout configurations pages actually produce, one per distinct arrangement
 * of the three slots `AppContentLayout` renders around the outlet.
 */
const LAYOUT_STATES: LayoutState[] = [
  {
    name: "no title bar, no content width (/conversation/new)",
    hasTitle: false,
    contentWidth: undefined,
    title: undefined,
  },
  {
    name: "no title bar, wide (/builder/agents)",
    hasTitle: false,
    contentWidth: "wide",
    title: undefined,
  },
  {
    name: "no title bar, centered (/labs)",
    hasTitle: false,
    contentWidth: "centered",
    title: undefined,
  },
  {
    name: "hasTitle, no content width (/conversation/:cId)",
    hasTitle: true,
    contentWidth: undefined,
    title: undefined,
  },
  {
    name: "hasTitle, centered",
    hasTitle: true,
    contentWidth: "centered",
    title: undefined,
  },
  {
    name: "title node, centered (/builder/agents/create)",
    hasTitle: false,
    contentWidth: "centered",
    title: TITLE_NODE,
  },
  {
    name: "title node, wide",
    hasTitle: false,
    contentWidth: "wide",
    title: TITLE_NODE,
  },
  {
    name: "title node, no content width",
    hasTitle: false,
    contentWidth: undefined,
    title: TITLE_NODE,
  },
];

describe("AppContentLayout", () => {
  beforeEach(() => {
    mountCount = 0;
    unmountCount = 0;
  });

  it("keeps the outlet mounted across every transition between layout states", () => {
    const remounts: string[] = [];

    for (const from of LAYOUT_STATES) {
      for (const to of LAYOUT_STATES) {
        mountCount = 0;
        unmountCount = 0;

        const { rerender, unmount } = render(<Harness state={from} />);
        expect(mountCount, `initial mount for "${from.name}"`).toBe(1);

        rerender(<Harness state={to} />);

        if (mountCount !== 1 || unmountCount !== 0) {
          remounts.push(
            `"${from.name}" -> "${to.name}" (${mountCount} mounts, ${unmountCount} unmounts)`
          );
        }
        unmount();
      }
    }

    expect(remounts).toEqual([]);
  });
});
