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
    <div className="s-flex s-flex-col s-gap-4">
      old spinner
      <div>
        <div className="s-p-20">
          <Spinner variant="success" />
        </div>
      </div>
      new spinner XS
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner2 variant="color" size="xs" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner2 variant="light" size="xs" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner2 variant="light" size="xs" />
        </div>
        <div className="s-p-20">
          <Spinner2 variant="dark" size="xs" />
        </div>
      </div>
      new spinner SM
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner2 variant="color" size="sm" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner2 variant="light" size="sm" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner2 variant="light" size="sm" />
        </div>
        <div className="s-p-20">
          <Spinner2 variant="dark" size="sm" />
        </div>
      </div>
      new spinner MD
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner2 variant="color" size="md" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner2 variant="light" size="md" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner2 variant="light" size="md" />
        </div>
        <div className="s-p-20">
          <Spinner2 variant="dark" size="md" />
        </div>
      </div>
      new spinner LG
      <div className="s-flex s-gap-4">
        <div className="s-p-20">
          <Spinner2 variant="color" size="lg" />
        </div>
        <div className="s-bg-slate-900 s-p-20">
          <Spinner2 variant="light" size="lg" />
        </div>
        <div className="s-bg-emerald-500 s-p-20">
          <Spinner2 variant="light" size="lg" />
        </div>
        <div className="s-p-20">
          <Spinner2 variant="dark" size="lg" />
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
