import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Spinner } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Spinner",
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpinnerExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-4">
      Size = XS
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner variant="color" size="xs" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner variant="light" size="xs" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner variant="light" size="xs" />
        </div>
        <div className="s-p-20">
          <Spinner variant="dark" size="xs" />
        </div>
        <div className="s-p-20">
          <Spinner variant="pink900" size="xs" />
        </div>
      </div>
      Size = SM
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner variant="color" size="sm" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner variant="light" size="sm" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner variant="light" size="sm" />
        </div>
        <div className="s-p-20">
          <Spinner variant="dark" size="sm" />
        </div>
        <div className="s-p-20">
          <Spinner variant="pink900" size="sm" />
        </div>
      </div>
      Size = MD
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner variant="color" size="md" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner variant="light" size="md" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner variant="light" size="md" />
        </div>
        <div className="s-p-20">
          <Spinner variant="dark" size="md" />
        </div>
      </div>
      Size = LG
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner variant="color" size="lg" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner variant="light" size="lg" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner variant="light" size="lg" />
        </div>
        <div className="s-p-20">
          <Spinner variant="dark" size="lg" />
        </div>
      </div>
      Size = XL
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner variant="color" size="xl" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner variant="light" size="xl" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner variant="light" size="xl" />
        </div>
        <div className="s-p-20">
          <Spinner variant="dark" size="xl" />
        </div>
      </div>
      Size = XXL
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner variant="color" size="xxl" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner variant="light" size="xxl" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner variant="light" size="xxl" />
        </div>
        <div className="s-p-20">
          <Spinner variant="dark" size="xxl" />
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
