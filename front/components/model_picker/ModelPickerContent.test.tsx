import { ModelPickerContent } from "@app/components/model_picker/ModelPickerContent";
import { MODEL_TIERS } from "@app/components/model_picker/modelPickerUtils";
import type { ModelStreamResolutionsType } from "@app/types/api/assistant/models";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { Button, DropdownMenu, DropdownMenuTrigger } from "@dust-tt/sparkle";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

const STREAMS: ModelStreamResolutionsType = {
  auto_fast: {
    providerId: "openai",
    modelId: "gpt-5-mini",
    displayName: "GPT-5 Mini",
    reasoningEffort: "none",
  },
  auto: {
    providerId: "openai",
    modelId: "gpt-5",
    displayName: "GPT-5",
    reasoningEffort: "medium",
  },
  auto_complex: {
    providerId: "anthropic",
    modelId: "claude-sonnet-5",
    displayName: "Sonnet 5",
    reasoningEffort: "high",
  },
};

function renderContent({
  fallbackStreamIds = new Set<string>(),
}: {
  fallbackStreamIds?: ReadonlySet<string>;
} = {}) {
  return render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button label="Model" />
      </DropdownMenuTrigger>
      <ModelPickerContent
        side="bottom"
        selection={{ selected: [], agentDefault: null }}
        lockPremiumEfforts={false}
        ignoreTierRestrictions={false}
        tiers={MODEL_TIERS}
        degradedModelIds={new Set()}
        fallbackStreamIds={fallbackStreamIds}
        hostingRegion={null}
        makerGroups={[]}
        streamModels={[]}
        streams={STREAMS}
        isMakersExpanded={false}
        onToggleMakers={vi.fn()}
        expandedMakerId={null}
        onToggleMaker={vi.fn()}
        onSelectTier={vi.fn()}
        onSelectModel={vi.fn()}
      />
    </DropdownMenu>
  );
}

describe("ModelPickerContent", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("shows the orange degradation chip on a tier whose preferred model fell back", async () => {
    const user = userEvent.setup();
    renderContent({ fallbackStreamIds: new Set([AUTO_MODEL_ID]) });

    const standard = await screen.findByRole("menuitem", { name: /Standard/ });
    await user.hover(standard);

    expect(
      await screen.findAllByText(
        /The usual model for Standard is having issues\. You're on GPT-5 Medium until it's back\./
      )
    ).not.toHaveLength(0);
  });

  it("does not mark tiers that are not falling back", async () => {
    const user = userEvent.setup();
    renderContent();

    const standard = await screen.findByRole("menuitem", { name: /Standard/ });
    await user.hover(standard);

    expect(
      screen.queryByText(/The usual model for Standard is having issues/)
    ).not.toBeInTheDocument();
  });
});
