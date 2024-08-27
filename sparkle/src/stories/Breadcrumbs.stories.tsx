import type { Meta } from "@storybook/react";
import React from "react";

import { Breadcrumbs, CompanyIcon, HomeIcon } from "../index_with_tw_base";

const meta = {
  title: "Components/Breadcrumbs",
  component: Breadcrumbs,
} satisfies Meta<typeof Breadcrumbs>;

export default meta;

export const BreadcrumbsExample = () => {
  const items1 = [
    { label: "Home", href: "#", icon: HomeIcon },
    { label: "Vaults", href: "#" },
    { label: "My Vault" },
  ];
  const items2 = [
    { label: "Home", href: "#", icon: HomeIcon },
    { label: "Vaults", href: "#", icon: CompanyIcon },
    { label: "My Vault", href: "#" },
    { label: "Data Sources" },
  ];
  return (
    <div className="s-flex s-flex-col s-gap-4">
      <Breadcrumbs items={items1} />
      <Breadcrumbs items={items2} />
    </div>
  );
};
