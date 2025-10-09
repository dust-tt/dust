import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Spinner } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Spinner",
  component: Spinner,
  tags: ["autodocs"],
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpinnerExample = () => {
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
};

export const BasicSpinner: Story = {
  args: {
    size: "md",
  },
};
