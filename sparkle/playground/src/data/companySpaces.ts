import { Building04, Lock01, Server03 } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import type { Space } from "./types";

// Company Spaces are the workspace-wide knowledge shelves, as opposed to the
// Pods in `spaces.ts` — which the playground also models as `Space`. Keeping
// them apart lets a request say whether it targets a Pod or a Space, and pick
// the matching icon.

// `isPublic` splits the shelves the way the app does: an open Space is one
// anybody can walk into, a restricted one waits for an invitation.
export const mockCompanySpaces: Space[] = [
  {
    id: "company-space-1",
    name: "Company Data",
    description: "Handbook, policies and everything every employee can read",
    isPublic: true,
  },
  {
    id: "company-space-2",
    name: "Engineering Docs",
    description: "Architecture notes, runbooks and postmortems",
    isPublic: true,
  },
  {
    id: "company-space-3",
    name: "Sales Library",
    description: "Decks, battlecards and pricing for the field",
    isPublic: true,
  },
  {
    id: "company-space-4",
    name: "Customer Support",
    description: "Macros, escalation paths and the support knowledge base",
  },
  {
    id: "company-space-5",
    name: "Legal & Compliance",
    description: "Contracts, DPAs and audit evidence",
  },
  {
    id: "company-space-6",
    name: "Marketing",
    description: "Campaign briefs, brand assets and launch calendars",
    isPublic: true,
  },
  {
    id: "company-space-7",
    name: "Exec",
    description: "Board material, headcount plans and quarterly reviews",
  },
];

// The one shelf the whole workspace shares, and the only one that is not
// simply "open": it cannot be left, so it carries its own icon.
const COMPANY_WIDE_SPACE_ID = "company-space-1";

export const openCompanySpaces = mockCompanySpaces.filter(
  (space) => space.isPublic
);

export const restrictedCompanySpaces = mockCompanySpaces.filter(
  (space) => !space.isPublic
);

/** The icon a Space carries in the sidebar, following the app's own rule. */
export function getCompanySpaceIcon(
  space: Space
): ComponentType<{ className?: string }> {
  if (!space.isPublic) {
    return Lock01;
  }

  return space.id === COMPANY_WIDE_SPACE_ID ? Building04 : Server03;
}

/**
 * @param id - Company Space ID
 * @returns Space or undefined if not found
 */
export function getCompanySpaceById(id: string): Space | undefined {
  return mockCompanySpaces.find((space) => space.id === id);
}
