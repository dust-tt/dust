import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { File02, PaginatedCitationsGrid } from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/PaginatedCitationsGrid",
  tags: ["a11y-issues"],
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
type Story = StoryObj<typeof meta>;

const SOURCE_TITLES = [
  "Q3 2025 Revenue Report",
  "Onboarding Checklist — Sales Team",
  "Incident Postmortem: API Outage 2025-06-12",
  "Design System Migration RFC",
  "Customer Interview Notes — Acme Corp",
  "2026 Hiring Plan Draft",
  "Security Review: Vendor Assessment",
  "Product Roadmap — Assistant Platform",
  "Support Playbook: Escalation Process",
  "Data Retention Policy v3",
  "Engineering Weekly — Sprint 42",
  "Pricing Experiment Results",
  "Marketing Launch Brief — Connectors",
  "Legal Review: DPA Template",
  "OKR Check-in — Platform Team",
  "User Research Summary — Enterprise",
  "Architecture Decision Record 018",
  "Competitor Analysis — Q2 Update",
  "Internal FAQ: Billing Changes",
  "Release Notes — v2.14",
];

function makeCitationItems(count: number) {
  // Cycle through realistic document titles for larger sets.
  return Array.from({ length: count }, (_, idx) => ({
    title: SOURCE_TITLES[idx % SOURCE_TITLES.length],
    href: `https://docs.example.com/documents/${idx + 1}`,
    icon: <File02 />,
  }));
}

/**
 * Twenty citations — more than one page — so the grid shows its pagination
 * controls and pages through the source list.
 * @summary Multi-page grid of source citations.
 */
export const PaginatedResults: Story = {
  args: {
    items: makeCitationItems(20),
  },
};

/**
 * With only two items the set fits on a single page, so the pagination
 * chrome collapses and the grid renders just the citations.
 * @summary Below the page threshold, pagination controls disappear.
 */
export const WithFewItems: Story = {
  args: {
    items: makeCitationItems(2),
  },
};
