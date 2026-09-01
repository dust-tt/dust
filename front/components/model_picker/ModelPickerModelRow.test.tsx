import { ModelPickerModelRow } from "@app/components/model_picker/ModelPickerModelRow";
import { CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/components/sparkle/ThemeContext"), () => ({
  useTheme: () => ({ theme: "light", isDark: false, setTheme: vi.fn() }),
}));

const MODEL: ModelConfigurationType = CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG;

interface TestMenuProps {
  onSelectModel: (model: ModelConfigurationType) => void;
  onOpenChange: (open: boolean) => void;
}

function TestMenu({ onSelectModel, onOpenChange }: TestMenuProps) {
  return (
    <DropdownMenu defaultOpen onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button label="Model" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <ModelPickerModelRow
          model={MODEL}
          isSelected={false}
          isDefault={false}
          lockReason={null}
          isDegraded={false}
          effort={MODEL.defaultReasoningEffort}
          effortStops={[]}
          onSelectModel={onSelectModel}
          onChangeEffort={vi.fn()}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("ModelPickerModelRow", () => {
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

  it("keeps the menu open when picked, so its effort slider stays reachable", async () => {
    const user = userEvent.setup();
    const onSelectModel = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <TestMenu onSelectModel={onSelectModel} onOpenChange={onOpenChange} />
    );

    await user.click(await screen.findByRole("menuitem", { name: /Sonnet/ }));

    expect(onSelectModel).toHaveBeenCalledWith(MODEL);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
