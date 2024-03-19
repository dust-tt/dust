import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Spinner, Spinner2 } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Spinner",
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpinnerExample = () => {
  return (
    <div className="s-flex s-gap-4">
      <div className="s-p-20">
        <Spinner variant="success" />
      </div>
      <div className="s-p-20">
        <Spinner2 variant="color" />
      </div>
      <div className="s-bg-slate-900 s-p-20">
        <Spinner2 variant="light" />
      </div>
      <div className="s-bg-emerald-500 s-p-20">
        <Spinner2 variant="light" />
      </div>
      <div className="s-p-20">
        <Spinner2 variant="dark" />
      </div>
    </div>
  );
};

export const BasicSpinner: Story = {
  args: {
    size: "md",
  },
};
