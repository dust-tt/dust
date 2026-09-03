import { ModelPickerMakersView } from "@app/components/model_picker/ModelPickerMakersView";
import type {
  MakerGroup,
  ModelPickerSelectionModel,
} from "@app/components/model_picker/modelPickerUtils";
import { CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/components/sparkle/ThemeContext"), () => ({
  useTheme: () => ({ theme: "light", isDark: false, setTheme: vi.fn() }),
}));

const MODEL = CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG;

const MAKER_GROUPS: MakerGroup[] = [{ makerId: "anthropic", models: [MODEL] }];

const SELECTION: ModelPickerSelectionModel = {
  selected: [],
  agentDefault: null,
};

// Stubs the media queries `useIsWidthConstrained` and `useCanHover` read, so a
// test can render the picker as a touch device sees it.
function mockMediaQueries({ canHover }: { canHover: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("hover") ? canHover : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList
  );
}

function TestMenu() {
  const [expandedMakerId, setExpandedMakerId] = useState<"anthropic" | null>(
    null
  );

  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button label="Model" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <ModelPickerMakersView
          makerGroups={MAKER_GROUPS}
          selection={SELECTION}
          ignoreTierRestrictions={false}
          lockPremiumEfforts={false}
          degradedModelIds={new Set()}
          expandedMakerId={expandedMakerId}
          onToggleMaker={() =>
            setExpandedMakerId((current) =>
              current === null ? "anthropic" : null
            )
          }
          onSelectModel={vi.fn()}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("ModelPickerMakersView", () => {
  beforeAll(() => {
    // Radix relies on browser APIs that jsdom does not implement.
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("expands makers inline when the pointer can't hover, so touch can reach the models", async () => {
    mockMediaQueries({ canHover: false });
    const user = userEvent.setup();

    render(<TestMenu />);

    const maker = await screen.findByRole("menuitem", { name: /Anthropic/ });
    // A submenu trigger would be unreachable on touch: the maker must be a
    // plain item that expands in place.
    expect(maker).not.toHaveAttribute("aria-haspopup", "menu");
    expect(
      screen.queryByRole("menuitem", { name: /Sonnet/ })
    ).not.toBeInTheDocument();

    await user.click(maker);

    expect(
      await screen.findByRole("menuitem", { name: /Sonnet/ })
    ).toBeInTheDocument();
  });

  it("keeps hover submenus when the pointer can hover", async () => {
    mockMediaQueries({ canHover: true });

    render(<TestMenu />);

    expect(
      await screen.findByRole("menuitem", { name: /Anthropic/ })
    ).toHaveAttribute("aria-haspopup", "menu");
  });
});
