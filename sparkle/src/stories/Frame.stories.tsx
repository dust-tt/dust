import type { Meta } from "@storybook/react";
import React from "react";

import { Frame } from "../index_with_tw_base";

const meta = {
  title: "Utils/Frame",
  component: Frame,
} satisfies Meta<typeof Frame>;

export default meta;

export const Frames = () => {
  return (
    <Frame autoLayout="horizontal">
      <Frame>hello 1</Frame>
      <Frame>hello 2</Frame>
    </Frame>
  );
};
