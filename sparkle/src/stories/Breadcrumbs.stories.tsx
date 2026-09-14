import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import {
  Breadcrumbs,
  Building04,
  Folder,
  Globe01,
} from "../index_with_tw_base";

const meta = {
  title: "Navigation/Breadcrumbs",
  component: Breadcrumbs,
  parameters: {
    docs: {
      description: {
        component: `Displays the user's location within a hierarchy as a trail of clickable segments. Driven by an **items** array, where each item has a \`label\` and optional \`icon\`, \`href\`, or \`onClick\`. Choose a **size** (\`xs\` or \`sm\`); long trails automatically collapse middle segments into an ellipsis menu and truncate overflowing labels.

**When to use**
- To show and navigate the path to the current page within a nested structure (spaces, folders, data sources).

**Guidelines**
- Make the last item the current location and leave it without an \`href\` so it renders as non-interactive.
- Give intermediate items an \`href\` or \`onClick\` so users can jump back up the hierarchy.
- For switching between sibling views rather than levels of depth, use **Tabs** instead.`,
      },
    },
  },
  argTypes: {
    size: {
      control: "select",
      options: ["xs", "sm"],
      defaultValue: "sm",
    },
  },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A typical three-level trail: intermediate items are clickable (via `href`
 * or `onClick`) and the last item is the current, non-interactive location.
 * @summary Default short trail with a current location.
 */
export const ShortTrail: Story = {
  args: {
    items: [
      { label: "Home", href: "#", icon: Globe01 },
      { label: "Spaces", onClick: fn() },
      { label: "My Space" },
    ],
  },
};

/**
 * Trails longer than five items collapse their middle segments into an
 * ellipsis menu: the first two and last two items stay visible, and the
 * hidden ones are reachable from the ellipsis dropdown.
 * @summary Long trail collapsing into an ellipsis menu.
 */
export const EllipsisCollapse: Story = {
  args: {
    items: [
      { label: "Home", href: "#", icon: Globe01 },
      { label: "Company Space", href: "#", icon: Building04 },
      { label: "Data Sources", href: "#" },
      { label: "Quarterly Reports", href: "#", icon: Folder },
      { label: "2025", href: "#", icon: Folder },
      { label: "Q4", href: "#", icon: Folder },
      { label: "Drafts", href: "#", icon: Folder },
      { label: "Board deck" },
    ],
  },
};

/**
 * A single-item trail — the root of the hierarchy — renders as one
 * non-interactive segment with its icon.
 * @summary Single root item.
 */
export const SingleItem: Story = {
  args: {
    items: [{ label: "Home", icon: Globe01 }],
  },
};
