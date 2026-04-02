import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { SpinnerBrand } from "../index_with_tw_base";

const SPINNER_DUST_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
const SPINNER_DUST_VARIANTS = ["mono", "colored", "colored-gray"] as const;

const meta = {
  title: "Primitives/SpinnerBrand",
  component: SpinnerBrand,
  tags: ["autodocs"],
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
  },
} satisfies Meta<typeof SpinnerBrand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    size: "md",
    variant: "mono",
  },
};

export const Colored: Story = {
  args: {
    size: "md",
    variant: "colored",
  },
};

export const ColoredGray: Story = {
  args: {
    size: "md",
    variant: "colored-gray",
  },
};

export const Gallery: Story = {
  render: () => {
    return (
      <div className="s-flex s-flex-col s-gap-8">
        {SPINNER_DUST_VARIANTS.map((variant) => (
          <div key={variant} className="s-flex s-flex-col s-gap-3">
            <div className="s-heading-sm s-text-foreground">{variant}</div>
            <div className="s-flex s-items-end s-gap-6">
              {SPINNER_DUST_SIZES.map((size) => (
                <div key={size} className="s-flex s-flex-col s-items-center s-gap-2">
                  <SpinnerBrand size={size} variant={variant} />
                  <div className="s-label-xs s-text-muted-foreground">{size}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  },
};
