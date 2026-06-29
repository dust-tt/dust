import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Spinner } from "../index_with_tw_base";

const SPINNER_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
const SPINNER_TYPES = ["worm", "shapes"] as const;
const SPINNER_VARIANTS = [
  "mono",
  "revert",
  "light",
  "dark",
  "rose300",
] as const;

const meta = {
  title: "Feedback & Status/Spinner",
  component: Spinner,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Indicates that content is loading or an action is in progress. Choose a **size** to match the surrounding context and a **variant** to suit the background — **mono** automatically adapts to light and dark themes.

**When to use**
- For indeterminate waits where no progress percentage is available.

**Guidelines**
- For loading state inside a button, use the Button's **isLoading** prop instead of a standalone spinner.
- Pick **mono** when you want the spinner to follow the current theme.
- Use **light** on dark or colored backgrounds; **dark** forces a near-black arc regardless of theme.
- Use a custom color variant (e.g. \`rose300\`) to tint the spinner to match a surface.
- For long waits, pair the spinner with explanatory text.
- Use **xl** or **2xl** for full-page or modal loading states — their stroke scales proportionally with size.`,
      },
    },
  },
  argTypes: {
    size: {
      options: SPINNER_SIZES,
      control: { type: "select" },
      description: "Size of the spinner",
    },
    type: {
      options: SPINNER_TYPES,
      control: { type: "select" },
      description:
        "Animation style — worm is the arc/dash spinner, shapes is a single path that morphs sequentially: square → circle → triangle",
    },
    variant: {
      options: SPINNER_VARIANTS,
      control: { type: "select" },
      description:
        "Color variant — mono adapts to the current theme, light/dark force a specific appearance, custom colors (e.g. rose300) tint the spinner",
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    size: "md",
    variant: "mono",
    type: "worm",
  },
};

// ─── Size stories ─────────────────────────────────────────────────────────────

export const Small: Story = {
  args: { size: "sm", variant: "mono" },
};

export const Large: Story = {
  args: { size: "lg", variant: "mono" },
};

export const Display: Story = {
  name: "Display (xl / 2xl)",
  render: () => (
    <div className="s-flex s-items-end s-gap-12">
      <div className="s-flex s-flex-col s-items-center s-gap-3">
        <Spinner size="xl" variant="mono" />
        <span className="s-text-xs s-text-muted-foreground">xl — 128px</span>
      </div>
      <div className="s-flex s-flex-col s-items-center s-gap-3">
        <Spinner size="2xl" variant="mono" />
        <span className="s-text-xs s-text-muted-foreground">2xl — 192px</span>
      </div>
    </div>
  ),
};

// ─── Variant stories ──────────────────────────────────────────────────────────

export const MonoVariant: Story = {
  args: { size: "md", variant: "mono", type: "worm" },
};

export const ShapesVariant: Story = {
  name: "Shapes type (morphing)",
  render: () => (
    <div className="s-flex s-flex-col s-gap-6">
      <div className="s-flex s-items-end s-gap-6">
        {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
          <div key={size} className="s-flex s-flex-col s-items-center s-gap-2">
            <Spinner size={size} type="shapes" variant="mono" />
            <span className="s-text-xs s-text-muted-foreground">{size}</span>
          </div>
        ))}
      </div>
      <div className="s-flex s-items-center s-gap-6 s-rounded-xl s-bg-slate-900 s-p-6">
        <div className="s-flex s-flex-col s-items-center s-gap-2">
          <Spinner size="lg" type="shapes" variant="light" />
          <span className="s-text-xs s-text-slate-400">light</span>
        </div>
        <div className="s-flex s-flex-col s-items-center s-gap-2">
          <Spinner size="lg" type="shapes" variant="rose300" />
          <span className="s-text-xs s-text-slate-400">rose300</span>
        </div>
      </div>
    </div>
  ),
};

export const OnDark: Story = {
  name: "On dark background",
  render: () => (
    <div className="s-flex s-items-center s-gap-6 s-rounded-xl s-bg-slate-900 s-p-8">
      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <Spinner size="md" variant="light" />
        <span className="s-text-xs s-text-slate-400">light</span>
      </div>
      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <Spinner size="md" variant="revert" />
        <span className="s-text-xs s-text-slate-400">revert</span>
      </div>
      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <Spinner size="md" variant="rose300" />
        <span className="s-text-xs s-text-slate-400">rose300</span>
      </div>
    </div>
  ),
};

// ─── Use case stories ─────────────────────────────────────────────────────────

export const InlineWithText: Story = {
  name: "Inline with text",
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <div className="s-flex s-items-center s-gap-2 s-text-sm s-text-foreground">
        <Spinner size="xs" variant="mono" />
        <span>Saving changes…</span>
      </div>
      <div className="s-flex s-items-center s-gap-2 s-text-sm s-text-foreground">
        <Spinner size="sm" variant="mono" />
        <span>Loading messages…</span>
      </div>
      <div className="s-flex s-items-center s-gap-2 s-text-sm s-text-muted-foreground">
        <Spinner size="xs" variant="dark" />
        <span>Syncing data…</span>
      </div>
    </div>
  ),
};

export const CardLoading: Story = {
  name: "Card / section loading",
  render: () => (
    <div className="s-flex s-h-48 s-w-80 s-items-center s-justify-center s-rounded-xl s-border s-border-border s-bg-background">
      <div className="s-flex s-flex-col s-items-center s-gap-3">
        <Spinner size="lg" variant="mono" />
        <span className="s-text-sm s-text-muted-foreground">
          Loading content…
        </span>
      </div>
    </div>
  ),
};

export const PageLoading: Story = {
  name: "Full-page loading",
  render: () => (
    <div className="s-flex s-h-96 s-w-full s-items-center s-justify-center s-rounded-xl s-bg-background">
      <div className="s-flex s-flex-col s-items-center s-gap-4">
        <Spinner size="xl" variant="mono" />
        <span className="s-text-base s-text-muted-foreground">
          Loading workspace…
        </span>
      </div>
    </div>
  ),
};

export const ModalLoading: Story = {
  name: "Modal / overlay loading",
  render: () => (
    <div className="s-relative s-flex s-h-64 s-w-80 s-items-center s-justify-center s-overflow-hidden s-rounded-xl s-border s-border-border">
      <div className="s-absolute s-inset-0 s-flex s-flex-col s-gap-3 s-p-4 s-opacity-30">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="s-h-4 s-w-full s-rounded s-bg-muted-background"
          />
        ))}
      </div>
      <div className="s-absolute s-inset-0 s-flex s-items-center s-justify-center s-bg-background/80 s-backdrop-blur-sm">
        <Spinner size="lg" variant="mono" />
      </div>
    </div>
  ),
};

// ─── Full matrix ──────────────────────────────────────────────────────────────

export const SpinnerExample: Story = {
  render: () => {
    const sizes = SPINNER_SIZES;
    const combos = [
      { type: "worm", variant: "mono" },
      { type: "worm", variant: "dark" },
      { type: "worm", variant: "rose300" },
      { type: "shapes", variant: "mono" },
      { type: "shapes", variant: "dark" },
      { type: "shapes", variant: "rose300" },
    ] as const;
    return (
      <div className="s-flex s-flex-col s-gap-8">
        {sizes.map((size) => (
          <div key={size} className="s-flex s-flex-col s-gap-3">
            <div className="s-heading-base s-text-foreground dark:s-text-white">
              Size = {size.toUpperCase()}
            </div>
            <div className="s-flex s-flex-wrap s-items-center s-gap-8">
              {combos.map(({ type, variant }) => (
                <div
                  key={`${type}-${variant}`}
                  className="s-flex s-flex-col s-items-center s-gap-2"
                >
                  <div className="s-flex s-items-center s-justify-center s-p-4">
                    <Spinner size={size} type={type} variant={variant} />
                  </div>
                  <span className="s-text-xs s-text-muted-foreground">
                    {type}/{variant}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  },
};

export const BasicSpinner: Story = {
  args: { size: "md" },
};
