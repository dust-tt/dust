import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "Layout/Collapsible",
  tags: ["a11y-issues"],
  component: Collapsible,
  parameters: {
    docs: {
      description: {
        component: `A disclosure primitive that shows or hides a region of content. Compose **Collapsible** with a **CollapsibleTrigger** (pass a \`label\` for the default chevron toggle, or custom children) and a **CollapsibleContent** wrapping the hidden region.

**When to use**
- To progressively disclose secondary content (details, advanced options) behind a toggle.

**Guidelines**
- Use the **CollapsibleTrigger** \`label\` prop for the standard chevron affordance; only supply custom children when you need a bespoke trigger.
- For a richer expandable panel with header styling, consider sibling layout components rather than nesting heavy UI in the trigger.`,
      },
    },
  },
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleContent = (
  <div className="flex h-16 w-full items-center justify-center bg-muted-background">
    Advanced options
  </div>
);

/**
 * The standard disclosure: a labeled trigger with the default chevron, closed
 * until the user clicks it.
 * @summary Labeled trigger with default chevron.
 */
export const Default: Story = {
  args: {
    children: (
      <>
        <CollapsibleTrigger label="Show advanced options" />
        <CollapsibleContent>{sampleContent}</CollapsibleContent>
      </>
    ),
  },
  render: (args) => <Collapsible {...args} />,
};

/**
 * Pass custom children to the trigger instead of a `label` when the toggle
 * needs bespoke UI (here a Chip); the chevron is still shown by default.
 * @summary Custom trigger children instead of a label.
 */
export const CustomTrigger: Story = {
  args: {
    children: (
      <>
        <CollapsibleTrigger>
          <Chip>Filters</Chip>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 flex h-16 w-full items-center justify-center bg-muted-background">
            Filter controls
          </div>
        </CollapsibleContent>
      </>
    ),
  },
  render: (args) => <Collapsible {...args} />,
};

/**
 * Set `hideChevron` on the trigger when the custom trigger carries its own
 * affordance and the chevron would be redundant.
 * @summary Custom trigger with the chevron hidden.
 */
export const WithoutChevron: Story = {
  args: {
    children: (
      <>
        <CollapsibleTrigger hideChevron>
          <Chip>Filters</Chip>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 flex h-16 w-full items-center justify-center bg-muted-background">
            Filter controls
          </div>
        </CollapsibleContent>
      </>
    ),
  },
  render: (args) => <Collapsible {...args} />,
};

/**
 * Set `defaultOpen` on the root when the content should be visible on first
 * render but remain collapsible by the user.
 * @summary Expanded on first render via defaultOpen.
 */
export const OpenByDefault: Story = {
  args: {
    defaultOpen: true,
    children: (
      <>
        <CollapsibleTrigger label="Open by default" />
        <CollapsibleContent>{sampleContent}</CollapsibleContent>
      </>
    ),
  },
  render: (args) => <Collapsible {...args} />,
};
