import type { Meta } from "@storybook/react";
import React from "react";

import { Collapsible } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Collapsible",
  component: Collapsible,
} satisfies Meta<typeof Collapsible>;

export default meta;

export const CollapsibleExample = () => (
  <div>
    <Collapsible>
      <Collapsible.Button label="Click me" />
      <Collapsible.Panel>
        <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          Hello
        </div>
      </Collapsible.Panel>
    </Collapsible>

    <Collapsible>
      <Collapsible.Button label="Click me" />
      <Collapsible.Panel>
        <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          Hello
        </div>
      </Collapsible.Panel>
    </Collapsible>
    <Collapsible>
      <Collapsible.Button label="Click me" />
      <Collapsible.Panel>
        <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          Hello
        </div>
      </Collapsible.Panel>
    </Collapsible>
  </div>
);
