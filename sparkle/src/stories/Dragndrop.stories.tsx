import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { DragArea } from "../index_with_tw_base";

const meta = {
  title: "Primitives/DragArea",
  component: DragArea,
} satisfies Meta<typeof DragArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DragAreaExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-4">
      <DragArea />
    </div>
  );
};
