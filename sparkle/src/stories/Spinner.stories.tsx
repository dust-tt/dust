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
    <div className="flex items-end gap-12">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="xl" variant="mono" />
        <span className="text-xs text-muted-foreground">xl — 128px</span>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Spinner size="2xl" variant="mono" />
        <span className="text-xs text-muted-foreground">2xl — 192px</span>
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
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-6">
        {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
          <div key={size} className="flex flex-col items-center gap-2">
            <Spinner size={size} type="shapes" variant="mono" />
            <span className="text-xs text-muted-foreground">{size}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-6 rounded-xl bg-slate-900 p-6">
        <div className="flex flex-col items-center gap-2">
          <Spinner size="lg" type="shapes" variant="light" />
          <span className="text-xs text-slate-400">light</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Spinner size="lg" type="shapes" variant="rose300" />
          <span className="text-xs text-slate-400">rose300</span>
        </div>
      </div>
    </div>
  ),
};

export const OnDark: Story = {
  name: "On dark background",
  render: () => (
    <div className="flex items-center gap-6 rounded-xl bg-slate-900 p-8">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" variant="light" />
        <span className="text-xs text-slate-400">light</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" variant="revert" />
        <span className="text-xs text-slate-400">revert</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="md" variant="rose300" />
        <span className="text-xs text-slate-400">rose300</span>
      </div>
    </div>
  ),
};

// ─── Use case stories ─────────────────────────────────────────────────────────

export const InlineWithText: Story = {
  name: "Inline with text",
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Spinner size="xs" variant="mono" />
        <span>Saving changes…</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Spinner size="sm" variant="mono" />
        <span>Loading messages…</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="xs" variant="dark" />
        <span>Syncing data…</span>
      </div>
    </div>
  ),
};

export const CardLoading: Story = {
  name: "Card / section loading",
  render: () => (
    <div className="flex h-48 w-80 items-center justify-center rounded-xl border border-border bg-background">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" variant="mono" />
        <span className="text-sm text-muted-foreground">
          Loading content…
        </span>
      </div>
    </div>
  ),
};

export const PageLoading: Story = {
  name: "Full-page loading",
  render: () => (
    <div className="flex h-96 w-full items-center justify-center rounded-xl bg-background">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" variant="mono" />
        <span className="text-base text-muted-foreground">
          Loading workspace…
        </span>
      </div>
    </div>
  ),
};

export const ModalLoading: Story = {
  name: "Modal / overlay loading",
  render: () => (
    <div className="relative flex h-64 w-80 items-center justify-center overflow-hidden rounded-xl border border-border">
      <div className="absolute inset-0 flex flex-col gap-3 p-4 opacity-30">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-4 w-full rounded bg-muted-background"
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
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
      <div className="flex flex-col gap-8">
        {sizes.map((size) => (
          <div key={size} className="flex flex-col gap-3">
            <div className="heading-base text-foreground dark:text-white">
              Size = {size.toUpperCase()}
            </div>
            <div className="flex flex-wrap items-center gap-8">
              {combos.map(({ type, variant }) => (
                <div
                  key={`${type}-${variant}`}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="flex items-center justify-center p-4">
                    <Spinner size={size} type={type} variant={variant} />
                  </div>
                  <span className="text-xs text-muted-foreground">
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
