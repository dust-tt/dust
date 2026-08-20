import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Spinner } from "../index_with_tw_base";

const SPINNER_SIZES = ["xs", "sm", "md", "lg"] as const;
const SPINNER_TYPES = ["worm", "shapes", "tri"] as const;
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
- Use **lg** (the largest size) for full-page or modal loading states — the stroke scales proportionally with size.`,
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
        "Animation style — worm is the arc/dash spinner; shapes morphs through square → circle → triangle; tri is the legacy Dust Lottie spinner",
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

/**
 * Interactive spinner — tweak size, type, and variant from the Controls panel.
 * @summary Interactive playground.
 */
export const Playground: Story = {
  tags: ["!manifest"],
  args: {
    size: "md",
    variant: "mono",
    type: "worm",
  },
};

/**
 * The standard loading indicator: the worm (arc) type in the theme-adaptive
 * mono variant. Scale it with **size** — xs/sm for inline "Saving…" rows,
 * md for buttons and menus, lg for card, modal, or full-page loading states.
 * @summary Default theme-adaptive spinner.
 */
export const Default: Story = {
  args: { size: "md", variant: "mono", type: "worm" },
};

/**
 * The shapes type morphs through square → circle → triangle for a more
 * playful loading treatment. Works at every size and with every color
 * variant, just like the worm type.
 * @summary Morphing shapes animation.
 */
export const ShapesType: Story = {
  args: { size: "md", variant: "mono", type: "shapes" },
};

/**
 * The tri type is the legacy Dust Lottie spinner, kept for surfaces that
 * still use the original branded animation. Prefer worm or shapes for new
 * work.
 * @summary Legacy Lottie animation.
 */
export const TriType: Story = {
  args: { size: "md", variant: "mono", type: "tri" },
};

/**
 * Variants suited to dark or colored surfaces: **light** forces a white arc,
 * **revert** flips the theme adaptation, and custom colors like **rose300**
 * tint the spinner to match the surface.
 * @summary Variants for dark backgrounds.
 */
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

/**
 * Visual reference: every size crossed with each type/variant combination,
 * for design review only.
 * @summary Visual matrix of all sizes, types, and variants.
 */
export const FullMatrix: Story = {
  tags: ["!manifest"],
  render: () => {
    const sizes = SPINNER_SIZES;
    const combos = [
      { type: "worm", variant: "mono" },
      { type: "worm", variant: "dark" },
      { type: "worm", variant: "rose300" },
      { type: "shapes", variant: "mono" },
      { type: "shapes", variant: "dark" },
      { type: "shapes", variant: "rose300" },
      { type: "tri", variant: "mono" },
      { type: "tri", variant: "dark" },
      { type: "tri", variant: "rose300" },
    ] as const;
    return (
      <div className="flex flex-col gap-8">
        {sizes.map((size) => (
          <div key={size} className="flex flex-col gap-3">
            <div className="heading-base text-foreground dark:s-text-white">
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
