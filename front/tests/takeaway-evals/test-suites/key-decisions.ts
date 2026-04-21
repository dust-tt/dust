import {
  shouldExtractKeyDecision,
  shouldNotExtractActionItem,
  type TakeawayTestSuite,
} from "@app/tests/takeaway-evals/lib/types";

export const keyDecisionsSuite: TakeawayTestSuite = {
  name: "key-decisions",
  description: "Tests for key decision extraction and status classification",
  testCases: [
    // ── Explicit finalized decision ───────────────────────────────────────────

    {
      scenarioId: "explicit-decided",
      document: {
        id: "doc-kd-1",
        title: "Architecture review",
        type: "slack",
        text: [
          "Alice: After evaluating MongoDB and PostgreSQL, we've decided to go with PostgreSQL for the new user service.",
          "Bob: Makes sense given our existing Postgres expertise. I agree.",
          "Carol: Same here. Let's document this in the ADR.",
        ].join("\n"),
        uri: "https://example.com/doc-kd-1",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      expectedAssertions: [
        shouldExtractKeyDecision("PostgreSQL", { status: "decided" }),
      ],
      judgeCriteria: `The team explicitly decided on PostgreSQL. This should be extracted
as a key decision with status "decided".

Score 0 if no key decision about PostgreSQL is extracted.
Score 2 if extracted but with wrong status.
Score 3 if correctly extracted with status "decided".`,
    },

    // ── Open deliberation ─────────────────────────────────────────────────────

    {
      scenarioId: "open-deliberation",
      document: {
        id: "doc-kd-2",
        title: "Caching discussion",
        type: "slack",
        text: [
          "Alice: Should we use Redis or Memcached for the session cache?",
          "Bob: Redis has more features, but Memcached might be simpler for our use case",
          "Carol: Let's benchmark both and decide next week",
        ].join("\n"),
        uri: "https://example.com/doc-kd-2",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      expectedAssertions: [
        shouldExtractKeyDecision("cache", { status: "open" }),
      ],
      judgeCriteria: `The team is deliberating between Redis and Memcached but has not
decided yet. This should be a key decision with status "open".

Score 0 if no key decision is extracted.
Score 2 if extracted but with status "decided" instead of "open".
Score 3 if correctly extracted with status "open".`,
    },

    // ── Minor preference should NOT be a key decision ─────────────────────────

    {
      scenarioId: "minor-preference-excluded",
      document: {
        id: "doc-kd-3",
        title: "Code style chat",
        type: "slack",
        text: [
          "Alice: By the way, I kind of like single quotes over double quotes in TypeScript",
          "Bob: Anyway — we decided to migrate all services to Kubernetes by Q3.",
          "Carol: The K8s migration is a big one. Let's plan it properly.",
        ].join("\n"),
        uri: "https://example.com/doc-kd-3",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      expectedAssertions: [
        shouldExtractKeyDecision("Kubernetes", { status: "decided" }),
        shouldNotExtractActionItem("single quotes"),
      ],
      judgeCriteria: `The single quotes preference is trivial and should NOT be a key decision.
The Kubernetes migration is a significant architectural decision and should be extracted.

Score 0 if the single quotes preference is extracted as a key decision.
Score 1 if the K8s decision is missing.
Score 2 if both the K8s decision is correct and trivial preference is excluded.
Score 3 if only the K8s migration is extracted as a decided key decision.`,
    },
  ],
};
