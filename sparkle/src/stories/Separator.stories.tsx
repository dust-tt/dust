import type { Meta } from "@storybook/react";
import * as React from "react";

import { Separator } from "@sparkle/index_with_tw_base";

const meta = {
  title: "Primitives/Separator",
  component: Separator,
} satisfies Meta<typeof Separator>;

export default meta;

export const SeparatorExample = () => (
  <div>
    <div className="s-space-y-1">
      <h4 className="s-text-sm s-font-medium s-leading-none">Dust Separator</h4>
      <p className="s-text-sm s-text-muted-foreground">
        Lorem Ipsum is simply dummy text of the printing and typesetting industry.
      </p>
    </div>
    <Separator className="s-my-4" />
    <div className="s-flex s-h-5 s-items-center s-space-x-4 s-text-sm">
      <div>Dust</div>
      <Separator orientation="vertical" />
      <div>Separator</div>
      <Separator orientation="vertical" />
      <div>Menu</div>
    </div>
  </div>
);