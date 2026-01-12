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
        <Chip>Click me custom (with chevron)</Chip>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-muted-background">
          Custom trigger content with chevron shown by default
        </div>
      </CollapsibleContent>
    </Collapsible>
    <Collapsible>
      <CollapsibleTrigger hideChevron>
        <Chip>Click me custom (no chevron)</Chip>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-muted-background">
          Custom trigger content with chevron hidden
        </div>
      </CollapsibleContent>
    </Collapsible>
    <div className="s-rounded-md s-border s-border-gray-200 s-p-4">
      <h3 className="s-mb-2 s-font-medium">Default Open</h3>
      <Collapsible defaultOpen>
        <CollapsibleTrigger label="Open by default" />
        <CollapsibleContent>
          <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-muted-background">
            This collapsible is open by default
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </div>
);
