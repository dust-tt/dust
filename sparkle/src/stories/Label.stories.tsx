import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { expect } from "storybook/test";

import { Checkbox, Label } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Label",
  component: Label,
} satisfies Meta<typeof Label>;

export default meta;

export const LabelDemo = () => {
  const handleChange = () => {
    // This function intentionally left blank
  };
  return (
    <div>
      <div className="s-flex s-items-center s-space-x-2">
        <Checkbox onChange={handleChange} />
        <Label htmlFor="terms">Accept terms and conditions</Label>
      </div>
    </div>
  );
};

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "Email address", htmlFor: "email" },
  tags: ["ai-generated", "needs-work"],
};

export const Muted: Story = {
  args: { children: "Optional", isMuted: true },
  tags: ["ai-generated", "needs-work"],
};

// Smoke play: `htmlFor` must surface as the DOM `for` attribute so clicking the
// label focuses its associated control.
export const AssociatedWithControl: Story = {
  args: { children: "Workspace name", htmlFor: "workspace-input" },
  tags: ["ai-generated", "needs-work"],
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Workspace name")).toHaveAttribute(
      "for",
      "workspace-input"
    );
  },
};
