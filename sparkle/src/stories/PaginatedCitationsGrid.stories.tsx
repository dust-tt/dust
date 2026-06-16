import type { Meta } from "@storybook/react";
import React from "react";

import { File02, PaginatedCitationsGrid } from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/PaginatedCitationsGrid",
  component: PaginatedCitationsGrid,
  parameters: {
    docs: {
      description: {
        component: `A paginated grid of link citations for when an agent answer references many sources. Takes an \`items\` array of \`{ title, href, icon }\` and renders them as a grid, automatically paging through large sets while staying compact for a handful of items.

**When to use**
- To present a long list of source links (search results, references) without overflowing the message.

**Guidelines**
- Provide a meaningful \`title\` and \`icon\` per item so each source is identifiable.
- Use this for sizeable, homogeneous link lists; for a few rich, individually composed references use **Citation** with **CitationGrid**.`,
      },
    },
  },
} satisfies Meta<typeof PaginatedCitationsGrid>;

export default meta;

function makeCitationItems(items: number) {
  return Array.from({ length: items }, (_, idx) => ({
    title: `test ${idx + 1}`,
    href: "empty",
    icon: <File02 />,
  }));
}

export const PaginatedCitationsGridExample = () => {
  return (
    <>
      <div className="s-flex s-gap-6">
        <PaginatedCitationsGrid items={makeCitationItems(20)} />
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
