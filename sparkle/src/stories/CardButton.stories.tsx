import type { Meta } from "@storybook/react";
import React from "react";

import { CardButton } from "../index_with_tw_base";

const meta = {
  title: "Primitives/CardButton",
  component: CardButton,
} satisfies Meta<typeof CardButton>;

export default meta;

export const CitationsExample = () => (
  <div className="s-flex s-flex-col s-gap-8">
    <div className="s-flex s-gap-2">
      <CardButton>hello</CardButton>
      <CardButton variant="secondary">hello</CardButton>
      <CardButton variant="tertiary">hello</CardButton>
    </div>
  </div>
);
