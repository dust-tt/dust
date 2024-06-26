import type { Meta } from "@storybook/react";
import React from "react";

import { CitationType } from "@sparkle/components/Citation";

import { PaginatedCitationsGrid } from "../index_with_tw_base";

const meta = {
  title: "Modules/PaginatedCitationsGrid",
  component: PaginatedCitationsGrid,
} satisfies Meta<typeof PaginatedCitationsGrid>;

export default meta;

function makeCitationItems(items: number) {
  return Array.from({ length: items }, (_, idx) => ({
    title: `test ${idx + 1}`,
    href: "empty",
    type: "document" as CitationType,
  }));
}

export const PaginatedCitationsGridExample = () => {
  return (
    <>
      <div className="s-flex s-gap-6">
        <PaginatedCitationsGrid items={makeCitationItems(10)} />
      </div>
    </>
  );
};

export const WithFewItems = () => {
  return (
    <>
      <div className="s-flex s-gap-6">
        <PaginatedCitationsGrid items={makeCitationItems(2)} />
      </div>
    </>
  );
};
