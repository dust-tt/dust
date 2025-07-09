import type { Meta } from "@storybook/react";
import React from "react";

import {
  Chip,
  Collapsible,
  CollapsibleComponent,
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
        <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-muted-background">
          Hello
        </div>
      </CollapsibleContent>
    </Collapsible>

    <Collapsible>
      <CollapsibleTrigger label="Click me" />
      <CollapsibleContent>
        <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-muted-background">
          Hello
        </div>
      </CollapsibleContent>
    </Collapsible>
    <Collapsible>
      <CollapsibleTrigger label="Click me" />
      <CollapsibleContent>
        <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-muted-background">
          Hello
        </div>
      </CollapsibleContent>
    </Collapsible>
    <Collapsible>
      <CollapsibleTrigger>
        <Chip>Click me custom</Chip>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-muted-background">
          Anything goes for the Collapsible button
        </div>
      </CollapsibleContent>
    </Collapsible>
    <div className="s-rounded-md s-border s-border-gray-200 s-p-4">
      <h3 className="s-mb-2 s-font-medium">Default Open</h3>
      <CollapsibleComponent
        rootProps={{ defaultOpen: true }}
        triggerProps={{ label: "Open by default" }}
        contentChildren={
          <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-muted-background">
            This collapsible is open by default
          </div>
        }
      />
    </div>
  </div>
);
