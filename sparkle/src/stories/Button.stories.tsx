import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { expect, waitFor } from "storybook/test";

import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  type ButtonSizeType,
  type ButtonVariantType,
} from "@sparkle/components/Button";

import {
  ArrowRight,
  Button,
  Plus,
  Robot,
  Separator,
} from "../index_with_tw_base";

const ICONS = {
  none: null,
  Plus: Plus,
  Robot: Robot,
} as const;

const meta = {
  title: "Actions/Button",
  component: Button,
  tags: ["a11y-issues", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Buttons let users trigger an action or event — submitting a form, opening a dialog, or confirming a choice. The button comes in several visual **variants** and three **sizes** (xs / sm / md), and supports a leading and/or trailing icon, loading and disabled states, an inline counter, and a dropdown-chevron affordance (**isSelect**).

**For design review:** the **Overview** story shows every variant in light and dark side by side; **Sizes** shows the S/M/L scale; **States** shows default / icon / loading / disabled. Press a button to see the 0.97 press animation (it's automatically suppressed on dropdown triggers).

**Guidelines**
- Use a single **highlight** button per view; use **outline** or a **ghost** variant for secondary actions.
- Write concise, verb-first labels ("Save changes", not "OK").
- An icon-only button (an **icon** with no **label**) should always have a **tooltip**. This replaces the deprecated **IconButton** component.
- Set **isLoading** during async work to communicate progress and prevent double submits.`,
      },
    },
  },
  argTypes: {
    variant: {
      description: "The visual style variant of the button",
      options: BUTTON_VARIANTS,
      control: { type: "select" },
    },
    size: {
      description: "The size of the button",
      options: BUTTON_SIZES,
      control: { type: "select" },
    },
    icon: {
      description: "Leading icon (omit the label for an icon-only button)",
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
    },
    iconRight: {
      description: "Trailing icon",
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
    },
    label: {
      description: "Button label (omit for an icon-only button)",
      control: { type: "text" },
    },
    disabled: {
      description: "Whether the button should be disabled",
      control: "boolean",
      defaultValue: false,
    },
    isLoading: {
      description: "Whether the button should display a loading spinner",
      control: "boolean",
    },
    isSelect: {
      description: "Whether the button should display a dropdown chevron",
      control: "boolean",
    },
    isCounter: {
      description: "Whether the button should display an inline counter",
      control: "boolean",
    },
    counterValue: {
      description: "Value to display in the counter (if isCounter is true)",
      control: "text",
      if: { arg: "isCounter", eq: true },
    },
    isPulsing: {
      description: "Whether the button should have a pulsing ring animation",
      control: "boolean",
    },
    tooltip: {
      description: "Optional tooltip text to display on hover",
      control: "text",
    },
  },
  render: (args) => <Button {...args} />,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Showcase helpers
// ---------------------------------------------------------------------------

const labelClass = "text-xs font-medium text-muted-foreground ";

// One variant row across its states.
function VariantRow({
  variant,
  size,
}: {
  variant: ButtonVariantType;
  size: ButtonSizeType;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-32 shrink-0 ${labelClass}`}>{variant}</div>
      <Button size={size} variant={variant} label="Button" />
      <Button size={size} variant={variant} icon={Plus} label="Button" />
      <Button
        size={size}
        variant={variant}
        icon={Plus}
        iconRight={ArrowRight}
        label="Button"
      />
      <Button size={size} variant={variant} icon={Plus} tooltip="Add" />
      <Button size={size} variant={variant} label="Button" isLoading />
      <Button size={size} variant={variant} label="Button" disabled />
    </div>
  );
}

function ColumnLegend() {
  return (
    <div className={`flex items-center gap-3 ${labelClass}`}>
      <div className="w-32 shrink-0">variant \ state</div>
      <div className="w-[88px]">label</div>
      <div className="w-[112px]">+ icon</div>
      <div className="w-[132px]">+ both</div>
      <div className="w-8">icon</div>
      <div className="w-[100px]">loading</div>
      <div>disabled</div>
    </div>
  );
}

function VariantGrid({ size = "md" }: { size?: ButtonSizeType }) {
  return (
    <div className="flex flex-col gap-3">
      <ColumnLegend />
      {BUTTON_VARIANTS.map((variant) => (
        <VariantRow key={variant} variant={variant} size={size} />
      ))}
    </div>
  );
}

// A themed surface card. `dark` toggles the `.dark` ancestor (sparkle's
// class-based dark mode) so every button inside renders its dark treatment.
function Surface({
  dark = false,
  title,
  caption,
  children,
}: {
  dark?: boolean;
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        dark ? "dark border-border" : "",
        !dark ? "bg-background border-border" : "",
        "flex flex-col gap-4 rounded-2xl border p-6",
      ].join(" ")}
      style={dark ? { backgroundColor: "#1F1C19" } : undefined}
    >
      <div>
        <div className="text-sm font-semibold text-foreground ">{title}</div>
        {caption && <div className={`mt-0.5 ${labelClass}`}>{caption}</div>}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Interactive single button — tweak any prop from the Controls panel. */
export const Playground: Story = {
  args: {
    variant: "primary",
    label: "Button",
    size: "md",
    isLoading: false,
    isSelect: false,
    isPressed: false,
    isPulsing: false,
    disabled: false,
    isCounter: false,
    counterValue: "1",
  },
};

/**
 * Every variant in light and dark, side by side — the main story for design
 * review. Each row walks through the states: label, + icon, + both icons,
 * icon-only, loading, disabled.
 */
export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Surface title="Light">
        <VariantGrid size="md" />
      </Surface>
      <Surface
        dark
        title="Dark"
        caption="Primary and outline swap in dark mode (designer spec); every other variant is unchanged — its tokens adapt on their own."
      >
        <VariantGrid size="md" />
      </Surface>
    </div>
  ),
};

/** The S / M / L scale (24 / 32 / 40px) across all variants. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {BUTTON_SIZES.map((size) => (
        <div key={size} className="flex flex-col gap-3">
          <Separator />
          <h3 className={labelClass}>{size.toUpperCase()}</h3>
          <VariantGrid size={size} />
        </div>
      ))}
    </div>
  ),
};

/** Icon-only buttons across sizes, plus the fully-rounded shape. */
export const IconButtons: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="xs" variant="outline" icon={Plus} tooltip="Add" />
      <Button size="sm" variant="outline" icon={Plus} tooltip="Add" />
      <Button size="md" variant="outline" icon={Plus} tooltip="Add" />
      <Button size="md" variant="highlight" icon={Plus} tooltip="Add" />
      <Button size="md" variant="primary" icon={Robot} tooltip="Agent" />
    </div>
  ),
};

/** Dropdown affordance (isSelect), inline counter, and pulsing. */
export const SpecialStates: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Button variant="outline" label="Select agent" icon={Robot} isSelect />
        <Button variant="primary" label="Filter" isSelect />
        <Button variant="outline" label="Messages" isCounter counterValue="8" />
        <Button variant="primary" label="Live" isPulsing />
      </div>
    </div>
  ),
};

const PRESSED_VARIANTS = [
  "ghost",
  "ghost-secondary",
  "highlight-ghost",
  "warning-ghost",
] as const;

function PressedRow() {
  return (
    <div className="flex items-center gap-4">
      {PRESSED_VARIANTS.map((variant) => (
        <div key={variant} className="flex items-center gap-2">
          <Button variant={variant} label="Plan" icon={Robot} />
          <Button variant={variant} label="Plan" icon={Robot} isPressed />
        </div>
      ))}
    </div>
  );
}

/**
 * Toggle buttons (`isPressed`) that open or close something, such as a side
 * panel: each pair shows the resting state next to the pressed one. Ghost
 * variants keep a background while pressed; every variant exposes `aria-pressed`.
 * @summary Pressed toggle state.
 */
export const Pressed: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Surface title="Light">
        <PressedRow />
      </Surface>
      <Surface dark title="Dark">
        <PressedRow />
      </Surface>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const pressed = canvasElement.querySelectorAll('[aria-pressed="true"]');
      const resting = canvasElement.querySelectorAll(
        "button:not([aria-pressed])"
      );
      // 4 variants x 2 surfaces, pressed and resting alternate.
      expect(pressed).toHaveLength(8);
      expect(resting).toHaveLength(8);
    });
  },
};
