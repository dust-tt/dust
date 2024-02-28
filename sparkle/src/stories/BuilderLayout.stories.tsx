import type { Meta } from "@storybook/react";
import React from "react";

import { BuilderLayout, Page } from "../index_with_tw_base";

const meta = {
  title: "Layout/Builder",
  component: Page,
} satisfies Meta<typeof Page>;

export default meta;

export const PageHorExample = () => {
  return (
    <div className="s-h-[800px] s-w-full">
      <BuilderLayout />
    </div>
  );
};
