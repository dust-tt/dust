import type { Meta } from "@storybook/react";
import React from "react";

import { Breadcrumbs, Building04, Folder, Home01 } from "../index_with_tw_base";

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

type BreadcrumbsExampleProps = {
  size?: "xs" | "sm";
};

export const BreadcrumbsExample = (args: BreadcrumbsExampleProps) => {
  const items0 = [{ label: "Home", icon: Home01 }];

  const items1 = [
    { label: "Home", href: "#", icon: Home01 },
    { label: "Spaces", onClick: () => alert("Spaces clicked!") },
    { label: "My Space" },
  ];
  const items2 = [
    { label: "Home", href: "#", icon: Home01 },
    { label: "Spaces", href: "#", icon: Building04 },
    { label: "My Space", href: "#" },
    { label: "loooong name in the end, like very very long long" },
  ];

  const items3 = [
    { label: "Home", href: "#", icon: Home01 },
    {
      label: "Middle long name, oh very looong folder name in the middle",
      href: "#",
      icon: Building04,
    },
    { label: "My Space", href: "#" },
    { label: "Data Sources", href: ".." },
    { label: "Folder1", href: "#", icon: Folder },
    { label: "With ellipsis", href: "#" },
  ];

  const items4 = [
    { label: "Home", href: "#", icon: Home01 },
    {
      label: "Middle long name, oh very looong folder name in the middle",
      href: "#",
      icon: Building04,
    },
    { label: "My Space", href: "#" },
    { label: "Data Sources" },
    { label: "Folder1", href: "#", icon: Folder },
    { label: "Folder2", href: "#", icon: Folder },
    { label: "Folder3", href: "#", icon: Folder },
    { label: "With ellipsis", href: "#" },
  ];

  const items5 = [
    { label: "Home", href: "#", icon: Home01 },
    {
      label: "Long, oh very looong folder name in the middle",
      href: "#",
      icon: Building04,
    },
    { label: "My Space", href: "#" },
    { label: "Data Sources" },
  ];

  return (
    <div className="s-flex s-flex-col s-gap-4 s-pb-8">
      <Breadcrumbs items={items0} {...args} />
      <Breadcrumbs items={items1} {...args} />
      <Breadcrumbs items={items2} {...args} />
      <Breadcrumbs items={items4} {...args} />
      <Breadcrumbs items={items3} {...args} />
      <Breadcrumbs items={items5} {...args} />
    </div>
  );
};
