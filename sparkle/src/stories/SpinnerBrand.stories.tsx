import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { SpinnerBrand } from "../index_with_tw_base";

const SPINNER_DUST_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
const SPINNER_DUST_VARIANTS = [
  "mono",
  "mono-white",
  "colored",
  "colored-gray",
] as const;

const meta = {
  title: "Feedback & Status/SpinnerBrand",
  component: SpinnerBrand,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A branded, Dust-logo loading indicator for indeterminate waits. Pick a **size** (\`xs\` through \`2xl\`) to fit the context and a **variant** to suit the background — \`mono\`, \`mono-white\` (for dark surfaces), \`colored\`, or \`colored-gray\`. The **speed** prop multiplies the animation rate (1 = normal).

**When to use**
- For prominent, brand-forward loading moments such as app or page initialization.

**Guidelines**
- Use \`mono-white\` on dark backgrounds and the colored variants on light surfaces.
- For a neutral, utilitarian spinner (e.g. inside a button or a small inline area), use **Spinner** instead.
- When the loading layout is known ahead of time, prefer a **LoadingBlock** skeleton.`,
      },
    },
  },
  argTypes: {
    size: {
      options: SPINNER_DUST_SIZES,
      control: { type: "select" },
      description: "Size of the spinner",
    },
    variant: {
      options: SPINNER_DUST_VARIANTS,
      control: { type: "select" },
      description: "Visual variant of the spinner",
    },
    speed: {
      control: { type: "number", min: 0.1, max: 5, step: 0.1 },
      description: "Animation speed multiplier (1 = normal)",
    },
  },
} satisfies Meta<typeof SpinnerBrand>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Interactive branded spinner — tweak size, variant, and speed from the
 * Controls panel. The 0.4 speed mirrors the component's own default (the
 * Lottie animation is authored fast, so production surfaces slow it down).
 * @summary Interactive playground.
 */
export const Playground: Story = {
  tags: ["!manifest"],
  args: {
    size: "md",
    variant: "mono",
    speed: 0.4,
  },
};

/**
 * The mono-white variant renders the logo in white for dark or richly
 * colored surfaces where the standard mono treatment would vanish.
 * @summary White variant for dark surfaces.
 */
export const MonoWhite: Story = {
  args: {
    size: "md",
    variant: "mono-white",
  },
  parameters: {
    backgrounds: { default: "dark" },
  },
};

/**
 * The colored variant shows the full-color Dust logo — the most
 * brand-forward treatment, suited to app or page initialization screens on
 * light surfaces.
 * @summary Full-color brand variant.
 */
export const Colored: Story = {
  args: {
    size: "md",
    variant: "colored",
  },
};

/**
 * The colored-gray variant keeps the multi-tone animation but in muted
 * grays, for loading moments that should stay subdued while remaining
 * on-brand.
 * @summary Muted gray brand variant.
 */
export const ColoredGray: Story = {
  args: {
    size: "md",
    variant: "colored-gray",
  },
};

/**
 * Visual reference: every variant crossed with every size (xs through 2xl),
 * for design review only.
 * @summary Visual matrix of all variants and sizes.
 */
export const Gallery: Story = {
  tags: ["!manifest"],
  render: () => {
    return (
      <div className="flex flex-col gap-8">
        {SPINNER_DUST_VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-col gap-3">
            <div className="heading-sm text-foreground">{variant}</div>
            <div className="flex items-end gap-6">
              {SPINNER_DUST_SIZES.map((size) => (
                <div key={size} className="flex flex-col items-center gap-2">
                  <SpinnerBrand size={size} variant={variant} />
                  <div className="label-xs text-muted-foreground">{size}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  },
};
