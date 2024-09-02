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
} satisfies Meta<typeof Breadcrumbs>;

export default meta;

export const BreadcrumbsExample = () => {
  const items1 = [
    { label: "Home", href: "#", icon: HomeIcon },
    { label: "Vaults", href: ".." },
    { label: "My Vault" },
  ];
  const items2 = [
    { label: "Home", href: "#", icon: HomeIcon },
    { label: "Vaults", href: "#", icon: CompanyIcon },
    { label: "My Vault", href: "#" },
    { label: "loooong name in the end, like very very long long" },
  ];

  const items3 = [
    { label: "Home", href: "#", icon: HomeIcon },
    {
      label: "Middle long name, oh very looong folder name in the middle",
      href: "#",
      icon: CompanyIcon,
    },
    { label: "My Vault", href: "#" },
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
    { label: "My Vault", href: "#" },
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
    { label: "My Vault", href: "#" },
    { label: "Data Sources" },
  ];

  return (
    <div className="s-flex s-flex-col s-gap-4 s-pb-8">
      <Breadcrumbs items={items1} />
      <Breadcrumbs items={items2} />
      <Breadcrumbs items={items4} />
      <Breadcrumbs items={items3} />
      <Breadcrumbs items={items5} />
    </div>
  );
};
