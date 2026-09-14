import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Container } from "../index_with_tw_base";

const meta: Meta<typeof Container> = {
  title: "Layout/Container",
  component: Container,
  parameters: {
    docs: {
      description: {
        component: `A centered page wrapper that provides responsive horizontal padding and a built-in vertical **ScrollArea**. Use **fixed** to clamp content to a centered max width, and **noPadding** to opt out of the default responsive padding. It also establishes a CSS container context so descendants can use \`@container\` queries.

**When to use**
- As the outermost wrapper for page or panel content that should scroll and stay centered.

**Guidelines**
- Use **fixed** for reading-width content (forms, articles) and full width for dashboards or tables.
- Since it owns the scroll region, give it a bounded height (e.g. \`h-full\`) rather than nesting another **ScrollArea**.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const sampleContent = (
  <p className="text-base leading-relaxed text-foreground">
    Agents connect to your company knowledge — Notion pages, Drive folders,
    Slack channels — and answer questions with citations back to the source.
    Configure which spaces an agent can read from its settings page, then share
    it with your team so everyone gets the same grounded answers.
  </p>
);

/**
 * With `fixed`, content is clamped to a centered max width (max-w-4xl) — use
 * it for reading-width content such as forms and articles. The border marks
 * the container's full-width bounds around the centered content.
 * @summary Content clamped to a centered max width.
 */
export const Fixed: Story = {
  args: {
    fixed: true,
    children: sampleContent,
  },
  render: (args) => (
    <div className="h-[400px] w-full">
      <Container {...args} className="h-full border border-border" />
    </div>
  ),
};

/**
 * Without `fixed`, content spans the container's full width (padding aside) —
 * use it for dashboards and tables that should use all available space.
 * @summary Content spanning the full container width.
 */
export const Fluid: Story = {
  args: {
    children: sampleContent,
  },
  render: (args) => (
    <div className="h-[400px] w-full">
      <Container {...args} className="h-full border border-border" />
    </div>
  ),
};
