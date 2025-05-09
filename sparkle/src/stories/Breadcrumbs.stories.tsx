import type { Meta } from "@storybook/react";
import React from "react";

import {
  Breadcrumbs,
  CompanyIcon,
  FolderIcon,
  HomeIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Components/Breadcrumbs",
  component: Breadcrumbs,
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
  const items1 = [
    { label: "Home", href: "#", icon: HomeIcon },
    { label: "Spaces", onClick: () => alert("Spaces clicked!") },
    { label: "My Space" },
  ];
  const items2 = [
    { label: "Home", href: "#", icon: HomeIcon },
    { label: "Spaces", href: "#", icon: CompanyIcon },
    { label: "My Space", href: "#" },
    { label: "loooong name in the end, like very very long long" },
  ];

  const items3 = [
    { label: "Home", href: "#", icon: HomeIcon },
    {
      label: "Middle long name, oh very looong folder name in the middle",
      href: "#",
      icon: CompanyIcon,
    },
    { label: "My Space", href: "#" },
    { label: "Data Sources", href: ".." },
    { label: "Folder1", href: "#", icon: FolderIcon },
    { label: "With ellipsis", href: "#" },
  ];

  const items4 = [
    { label: "Home", href: "#", icon: HomeIcon },
    {
      label: "Middle long name, oh very looong folder name in the middle",
      href: "#",
      icon: CompanyIcon,
    },
    { label: "My Space", href: "#" },
    { label: "Data Sources" },
    { label: "Folder1", href: "#", icon: FolderIcon },
    { label: "Folder2", href: "#", icon: FolderIcon },
    { label: "Folder3", href: "#", icon: FolderIcon },
    { label: "With ellipsis", href: "#" },
  ];

  const items5 = [
    { label: "Home", href: "#", icon: HomeIcon },
    {
      label: "Long, oh very looong folder name in the middle",
      href: "#",
      icon: CompanyIcon,
    },
    { label: "My Space", href: "#" },
    { label: "Data Sources" },
  ];

  return (
    <div className="s-flex s-flex-col s-gap-4 s-pb-8">
      <Breadcrumbs items={items1} {...args} />
      <Breadcrumbs items={items2} {...args} />
      <Breadcrumbs items={items4} {...args} />
      <Breadcrumbs items={items3} {...args} />
      <Breadcrumbs items={items5} {...args} />
    </div>
  );
};
