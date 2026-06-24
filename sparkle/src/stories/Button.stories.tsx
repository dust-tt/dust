import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

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
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Buttons let users trigger an action or event — submitting a form, opening a dialog, or confirming a choice. The button comes in several visual **variants** and three **sizes** (sm / md / lg), and supports a leading and/or trailing icon, loading and disabled states, an inline counter, a dropdown-chevron affordance (**isSelect**), and a fully-rounded shape (**isRounded**).

**For design review:** the **Overview** story shows every variant in light and dark side by side; **Sizes** shows the S/M/L scale; **States** shows default / icon / loading / disabled. Press a button to see the 0.97 press animation (it's automatically suppressed on dropdown triggers).

**Guidelines**
- Use a single **highlight** button per view; use **outline** or a **ghost** variant for secondary actions.
- Write concise, verb-first labels ("Save changes", not "OK").
- An icon-only button (an **icon** with no **label**) should always have a **tooltip**.
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
    isRounded: {
      description: "Whether the button is fully rounded (pill / circular)",
      control: "boolean",
    },
    isPulsing: {
      description: "Whether the button should have a pulsing ring animation",
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

const labelClass =
  "s-text-xs s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night";

// One variant row: the five states designers care about, left to right.
function VariantRow({
  variant,
  size,
}: {
  variant: ButtonVariantType;
  size: ButtonSizeType;
}) {
  return (
    <div className="s-flex s-items-center s-gap-3">
      <div className={`s-w-32 s-shrink-0 ${labelClass}`}>{variant}</div>
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
    <div className={`s-flex s-items-center s-gap-3 ${labelClass}`}>
      <div className="s-w-32 s-shrink-0">variant \ state</div>
      <div className="s-w-[88px]">label</div>
      <div className="s-w-[112px]">+ icon</div>
      <div className="s-w-[132px]">+ both</div>
      <div className="s-w-8">icon</div>
      <div className="s-w-[100px]">loading</div>
      <div>disabled</div>
    </div>
  );
}

function VariantGrid({ size = "md" }: { size?: ButtonSizeType }) {
  return (
    <div className="s-flex s-flex-col s-gap-3">
      <ColumnLegend />
      {BUTTON_VARIANTS.map((variant) => (
        <VariantRow key={variant} variant={variant} size={size} />
      ))}
    </div>
  );
}

// A themed surface card. `dark` toggles the `.s-dark` ancestor (sparkle's
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
        dark ? "s-dark s-bg-background-night s-border-border-night" : "",
        !dark ? "s-bg-background s-border-border" : "",
        "s-flex s-flex-col s-gap-4 s-rounded-2xl s-border s-p-6",
      ].join(" ")}
    >
      <div>
        <div className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
          {title}
        </div>
        {caption && <div className={`s-mt-0.5 ${labelClass}`}>{caption}</div>}
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
    isRounded: false,
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
    <div className="s-flex s-flex-col s-gap-6">
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
    <div className="s-flex s-flex-col s-gap-6">
      {BUTTON_SIZES.map((size) => (
        <div key={size} className="s-flex s-flex-col s-gap-3">
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
    <div className="s-flex s-items-center s-gap-4">
      <Button size="sm" variant="outline" icon={Plus} tooltip="Add" />
      <Button size="md" variant="outline" icon={Plus} tooltip="Add" />
      <Button size="lg" variant="outline" icon={Plus} tooltip="Add" />
      <Button
        size="md"
        variant="highlight"
        icon={Plus}
        isRounded
        tooltip="Add"
      />
      <Button size="md" variant="primary" icon={Robot} tooltip="Agent" />
    </div>
  ),
};

/** Dropdown affordance (isSelect), inline counter, rounded, and pulsing. */
export const SpecialStates: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <div className="s-flex s-items-center s-gap-4">
        <Button variant="outline" label="Select agent" icon={Robot} isSelect />
        <Button variant="primary" label="Filter" isSelect />
        <Button variant="outline" label="Messages" isCounter counterValue="8" />
        <Button variant="highlight" label="New" icon={Plus} isRounded />
        <Button variant="primary" label="Live" isPulsing />
      </div>
    </div>
  ),
};
