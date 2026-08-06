import { Button } from "@dust-tt/sparkle";
import type { Meta, StoryObj } from "@storybook/react";

import { SkillImportLoading } from "./SkillImportLoading";

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
  render: () => (
    <Button
      className="w-20"
      icon={<SkillImportLoading />}
      disabled
      aria-label="Importing skills"
    />
  ),
};
