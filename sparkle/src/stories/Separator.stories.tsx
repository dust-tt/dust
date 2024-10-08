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
      <h4 className="s-text-sm s-font-medium s-leading-none">
        Radix Primitives
      </h4>
      <p className="s-text-sm s-text-muted-foreground">
        An open-source UI component library.
      </p>
    </div>
    <Separator className="s-my-4" />
    <div className="s-flex s-h-5 s-items-center s-space-x-4 s-text-sm">
      <div>Blog</div>
      <Separator orientation="vertical" />
      <div>Docs</div>
      <Separator orientation="vertical" />
      <div>Source</div>
    </div>
  </div>
);
