import type { Meta } from "@storybook/react";
import React from "react";

import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "Primitives/Collapsible",
  component: Collapsible,
} satisfies Meta<typeof Collapsible>;

export default meta;

export const CollapsibleExample = () => (
  <div>
    <Collapsible>
      <CollapsibleTrigger label="Click me" />
      <CollapsibleContent>
        <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          Hello
        </div>
      </CollapsibleContent>
    </Collapsible>

    <Collapsible>
      <CollapsibleTrigger label="Click me" />
      <CollapsibleContent>
        <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          Hello
        </div>
      </CollapsibleContent>
    </Collapsible>
    <Collapsible>
      <CollapsibleTrigger label="Click me" />
      <CollapsibleContent>
        <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          Hello
        </div>
      </CollapsibleContent>
    </Collapsible>
    <Collapsible>
      <CollapsibleTrigger>
        <Chip>Click me custom</Chip>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          Anything goes for the Collapsible button
        </div>
      </CollapsibleContent>
    </Collapsible>
    <Collapsible defaultOpen={true}>
      <CollapsibleTrigger>
        <Chip>Click me custom</Chip>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
          This one is open by default
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
);
