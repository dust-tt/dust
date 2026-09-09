import type { Space } from "./types";

// Company Spaces are the workspace-wide knowledge shelves, as opposed to the
// Pods in `spaces.ts` — which the playground also models as `Space`. Keeping
// them apart lets a request say whether it targets a Pod or a Space, and pick
// the matching icon.

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
  },
  {
    id: "company-space-3",
    name: "Sales Library",
    description: "Decks, battlecards and pricing for the field",
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
];

/**
 * @param id - Company Space ID
 * @returns Space or undefined if not found
 */
export function getCompanySpaceById(id: string): Space | undefined {
  return mockCompanySpaces.find((space) => space.id === id);
}
