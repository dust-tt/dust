import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, SkillImportLoading } from "../index_with_tw_base";

const meta = {
  title: "Product/Skills/SkillImportLoading",
  component: SkillImportLoading,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The loading indicator shown in the Import button while skills are being added to a workspace.",
      },
    },
  },
} satisfies Meta<typeof SkillImportLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InImportButton: Story = {
  render: (): React.ReactElement => (
    <Button
      className="w-20"
      icon={<SkillImportLoading />}
      disabled
      aria-label="Importing skills"
    />
  ),
};
