export interface MockSkill {
  id: string;
  name: string;
  description: string;
}

// A short, fixed list — skills aren't generated per-space like knowledge is,
// so there's no need for the seeded-random machinery used elsewhere.
export const mockSkills: MockSkill[] = [
  {
    id: "skill-branded-frame",
    name: "Create a branded frame",
    description: "Build a frame using the workspace's brand kit",
  },
  {
    id: "skill-dog-adoption-card",
    name: "Write a dog adoption welcome card",
    description: "Draft a warm welcome note for a newly adopted dog",
  },
  {
    id: "skill-summarize",
    name: "Summarize document",
    description: "Condense a long document into key points",
  },
  {
    id: "skill-extract-data",
    name: "Extract structured data",
    description: "Pull fields out of invoices, forms, or reports",
  },
  {
    id: "skill-translate",
    name: "Translate text",
    description: "Translate content between languages",
  },
  {
    id: "skill-code-review",
    name: "Review code",
    description: "Check a diff for bugs and style issues",
  },
  {
    id: "skill-draft-email",
    name: "Draft an email",
    description: "Write a reply in the right tone",
  },
  {
    id: "skill-meeting-notes",
    name: "Write meeting notes",
    description: "Turn a transcript into structured notes and action items",
  },
];
