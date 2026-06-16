import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { expect } from "storybook/test";

import { Separator } from "@sparkle/index_with_tw_base";

const meta = {
  title: "Layout/Separator",
  component: Separator,
  parameters: {
    docs: {
      description: {
        component: `A thin dividing line for visually separating content, with an **orientation** (\`horizontal\` / \`vertical\`) and a **decorative** flag. When \`decorative\` is false it exposes \`role="separator"\` and \`aria-orientation\` for assistive tech; when true it is purely visual.

**When to use**
- To divide groups of related content, list items, or inline elements (e.g. between menu entries).

**Guidelines**
- Set **decorative={false}** only when the separation is meaningful to screen-reader users; otherwise leave it decorative.
- Add spacing via margin utilities (e.g. \`s-my-4\`) rather than relying on the line itself.`,
      },
    },
  },
} satisfies Meta<typeof Separator>;

export default meta;

export const SeparatorExample = () => (
  <div>
    <div className="s-space-y-1">
      <h4 className="s-text-sm s-font-medium s-leading-none">Dust Separator</h4>
      <p className="s-text-sm s-text-muted-foreground">
        Lorem Ipsum is simply dummy text of the printing and typesetting
        industry.
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

type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  tags: ["ai-generated", "needs-work"],
  render: () => (
    <div className="s-w-64">
      <Separator />
    </div>
  ),
};

// A semantic (non-decorative) vertical separator must expose role="separator" and
// aria-orientation="vertical" — proving the orientation prop drives the accessibility tree.
export const Vertical: Story = {
  args: { orientation: "vertical", decorative: false },
  tags: ["ai-generated", "needs-work"],
  render: (args) => (
    <div className="s-flex s-h-16">
      <Separator {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const separator = canvas.getByRole("separator");
    await expect(separator).toHaveAttribute("aria-orientation", "vertical");
  },
};
