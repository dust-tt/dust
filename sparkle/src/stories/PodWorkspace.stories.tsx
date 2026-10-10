import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect } from "storybook/test";

function PodWorkspacePreview() {
  return (
    <iframe
      title="Pod workspace playground"
      src="http://localhost:3008/#Pod_Workspace"
      className="h-screen w-full border-0"
    />
  );
}

const meta = {
  title: "Lab/Pod workspace",
  component: PodWorkspacePreview,
  tags: ["!manifest"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A SaaS company workspace with a recurring Voice of Customer pod and a one-off Northstar tender. Requires the playground dev server on port 3008. Local changes persist across reloads. Uploads show file previews and require a destination before confirmation. Existing files are linked through Add files.",
      },
    },
  },
} satisfies Meta<typeof PodWorkspacePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByTitle("Pod workspace playground")).toHaveAttribute(
      "src",
      "http://localhost:3008/#Pod_Workspace"
    );
  },
};
