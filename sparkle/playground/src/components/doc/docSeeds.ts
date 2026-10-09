import { mockUsers } from "../../data";
import type { DocAuthor, DocComment } from "./docTypes";

// Comments colleagues "already left" on demo documents, so the co-edition
// panel opens on a lived-in review. Keyed by file name; quotes must match the
// document's text exactly to be anchored.

const YOU: DocAuthor = { name: "You" };
export { YOU };

/** The workspace's people, for @mentions in comments. */
export const WORKSPACE_PEOPLE: DocAuthor[] = mockUsers.map((user) => ({
  name: user.fullName,
  pictureUrl: user.portrait,
}));

function colleague(index: number): DocAuthor {
  const user = mockUsers[index];
  return { name: user.fullName, pictureUrl: user.portrait };
}

const emma = colleague(0); // Growth
const lucas = colleague(1); // Sales
const marco = colleague(5); // Finance
const amelie = colleague(6); // Brand
const elena = colleague(8); // Quality & regulatory

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

type Seed = Omit<DocComment, "id" | "resolved" | "replies"> & {
  replies?: Array<{ author: DocAuthor; body: string; createdAt: Date }>;
};

const SEEDS: Record<string, Seed[]> = {
  "pupchi-benchmark.md": [
    {
      quote: "“Tiny treat, big moment.”",
      author: amelie,
      body: "Glad both taglines are in the concept test. Can we also show them on pack mockups? A tagline reads very differently on a pouch than in a survey.",
      createdAt: hoursAgo(26),
      replies: [
        {
          author: emma,
          body: "+1, and let's test them in a social ad too, that's where most puppy parents will meet us first.",
          createdAt: hoursAgo(25),
        },
        {
          author: lucas,
          body: "Retail buyers will see the pouch first, so I'd weigh the mockup results more than the survey.",
          createdAt: hoursAgo(24),
        },
        {
          author: marco,
          body: "Mockups are cheap: two pouch variants cost us under $400. Happy to sign off.",
          createdAt: hoursAgo(23),
        },
        {
          author: amelie,
          body: "Great, I'll brief the design team and share the mockups by Friday.",
          createdAt: hoursAgo(22),
        },
      ],
    },
    {
      quote:
        "at $6.99, keep the pouch under 4 ounces to meet the stated COGS-ratio constraint",
      author: marco,
      body: "Thanks for adding this. At our target bite size, 4 oz is about 60 treats. I'll share the unit-cost model so we can lock the range.",
      createdAt: hoursAgo(20),
      replies: [
        {
          author: lucas,
          body: "Shelf data is in the shared folder: Bocce's 6 oz bag holds about 45 pieces, so roughly 18¢ a treat.",
          createdAt: hoursAgo(19),
        },
        {
          author: YOU,
          body: "Thanks both, I'll update the price section once the model is in.",
          createdAt: hoursAgo(18),
        },
      ],
    },
    {
      quote:
        "“Natural and bakery-style” is increasingly crowded and not inherently puppy-specific.",
      author: lucas,
      body: "From retail meetings: Bocce's is the brand buyers compare us to the most. Worth a deeper section on their Soft & Chewy line.",
      createdAt: hoursAgo(8),
    },
    {
      quote: "explicit exclusion of xylitol",
      author: elena,
      body: "Regulatory will want the full exclusion list, not only xylitol (grapes, onion powder, some sweeteners…). I'll share our ingredient policy.",
      createdAt: hoursAgo(5),
    },
    {
      quote: "Repeat purchase within 45–60 days.",
      author: emma,
      body: "45–60 days feels long for a training treat: a small pouch runs out in about 3 weeks. I'd track 30 days as the main repeat signal.",
      createdAt: hoursAgo(2),
    },
  ],
};

export function seedCommentsFor(fileName: string): DocComment[] {
  return (SEEDS[fileName] ?? []).map((seed, i) => ({
    ...seed,
    id: `seed-${i}`,
    resolved: false,
    replies: (seed.replies ?? []).map((reply, j) => ({
      ...reply,
      id: `seed-${i}-reply-${j}`,
    })),
  }));
}
