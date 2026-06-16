import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Spinner } from "../index_with_tw_base";

const SPINNER_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
const SPINNER_VARIANTS = ["mono", "color", "light", "dark", "rose300"] as const;

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
- Pick **mono** when you want the spinner to follow the current theme; use **color** on neutral surfaces.
- For long waits, pair the spinner with explanatory text.`,
      },
    },
  },
  argTypes: {
    size: {
      options: SPINNER_SIZES,
      control: { type: "select" },
      description: "Size of the spinner",
    },
    variant: {
      options: SPINNER_VARIANTS,
      control: { type: "select" },
      description:
        "Visual variant of the spinner (mono adapts to dark/light theme)",
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    size: "md",
    variant: "color",
  },
};

export const Small: Story = {
  args: {
    size: "sm",
    variant: "color",
  },
};

export const Large: Story = {
  args: {
    size: "lg",
    variant: "color",
  },
};

export const MonoVariant: Story = {
  args: {
    size: "md",
    variant: "mono",
  },
};

export const SpinnerExample: Story = {
  render: () => {
    return (
      <div className="s-flex s-flex-col s-gap-4">
        <div className="s-heading-base s-text-foreground dark:s-text-white">
          Size = XS
        </div>
        <div className="s-flex s-gap-4">
          <div className="s-p-20">
            <Spinner variant="color" size="xs" />
          </div>
          <div className="s-p-20">
            <Spinner variant="mono" size="xs" />
          </div>
          <div className="s-p-20">
            <Spinner variant="rose300" size="xs" />
          </div>
        </div>
        <div className="s-heading-base s-text-foreground dark:s-text-white">
          Size = SM
        </div>
        <div className="s-flex s-gap-4">
          <div className="s-p-20">
            <Spinner variant="color" size="sm" />
          </div>
          <div className="s-p-20">
            <Spinner variant="mono" size="sm" />
          </div>
          <div className="s-p-20">
            <Spinner variant="rose300" size="sm" />
          </div>
        </div>
        <div className="s-heading-base s-text-foreground dark:s-text-white">
          Size = MD
        </div>
        <div className="s-flex s-gap-4">
          <div className="s-p-20">
            <Spinner variant="color" size="md" />
          </div>
          <div className="s-p-20">
            <Spinner variant="mono" size="md" />
          </div>
          <div className="s-p-20">
            <Spinner variant="rose300" size="md" />
          </div>
        </div>
        <div className="s-heading-base s-text-foreground dark:s-text-white">
          Size = LG
        </div>
        <div className="s-flex s-gap-4">
          <div className="s-p-20">
            <Spinner variant="color" size="lg" />
          </div>
          <div className="s-p-20">
            <Spinner variant="mono" size="lg" />
          </div>
          <div className="s-p-20">
            <Spinner variant="rose300" size="lg" />
          </div>
        </div>
        <div className="s-heading-base s-text-foreground dark:s-text-white">
          Size = XL
        </div>
        <div className="s-flex s-gap-4">
          <div className="s-p-20">
            <Spinner variant="color" size="xl" />
          </div>
          <div className="s-p-20">
            <Spinner variant="mono" size="xl" />
          </div>
          <div className="s-p-20">
            <Spinner variant="rose300" size="xl" />
          </div>
        </div>
        <div className="s-heading-base s-text-foreground dark:s-text-white">
          Size = XXL
        </div>
        <div className="s-flex s-gap-4">
          <div className="s-p-20">
            <Spinner variant="color" size="2xl" />
          </div>
          <div className="s-p-20">
            <Spinner variant="mono" size="2xl" />
          </div>
          <div className="s-p-20">
            <Spinner variant="rose300" size="2xl" />
          </div>
        </div>
      </div>
    );
  },
};

export const BasicSpinner: Story = {
  args: {
    size: "md",
  },
};
