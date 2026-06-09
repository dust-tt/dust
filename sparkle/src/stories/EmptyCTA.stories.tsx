import type { Meta } from "@storybook/react";
import React from "react";

import { Button, EmptyCTA, EmptyCTAButton } from "@sparkle/components";
import { DownloadCloud01, Plus } from "@sparkle/icons/v2-stroke";

const meta = {
  title: "Feedback & Status/EmptyCTA",
  parameters: {
    docs: {
      description: {
        component: `An empty-state placeholder that explains why a region has no content and offers a way forward. Renders an optional **message** alongside an **action** slot — typically an **EmptyCTAButton** (or a regular **Button**) that lets the user create the first item.

**When to use**
- When a list, table, or section has no data yet and you want to guide the user toward populating it.

**Guidelines**
- Keep the \`message\` short and explain what's missing; let the \`action\` describe the next step.
- Prefer **EmptyCTAButton** for the primary action to keep empty states visually consistent.
- For a transient loading placeholder rather than a true empty state, use a **LoadingBlock** skeleton.`,
      },
    },
  },
} satisfies Meta;

export default meta;

export const Demo = () => {
  return (
    <div className="s-flex s-flex-col s-gap-4">
      <div className="s-flex s-items-center s-space-x-2">
        <EmptyCTA
          action={
            <EmptyCTAButton icon={DownloadCloud01} label="Create a new space" />
          }
          message="You don't have any spaces yet."
        />
      </div>
      <div className="s-flex s-items-center s-space-x-2">
        <EmptyCTA action={<Button icon={Plus} label="Add domain" />} />
      </div>
    </div>
  );
};
