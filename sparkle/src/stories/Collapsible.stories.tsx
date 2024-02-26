import type { Meta } from "@storybook/react";
import React from "react";

import { Chip, Collapsible } from "../index_with_tw_base";

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
    <Collapsible>
      <Collapsible.Button>
        <Chip>Click me custom</Chip>
      </Collapsible.Button>
      <Collapsible.Panel>
        <div className="mt-1 s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          Anything goes for the Collapsible button
        </div>
      </Collapsible.Panel>
    </Collapsible>
    <Collapsible defaultOpen={true}>
      <Collapsible.Button>
        <Chip>Click me custom</Chip>
      </Collapsible.Button>
      <Collapsible.Panel>
        <div className="mt-1 s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          This one is open by default
        </div>
      </Collapsible.Panel>
    </Collapsible>
  </div>
);
