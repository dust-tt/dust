import {
  minActionItems,
  shouldExtractActionItem,
  shouldExtractKeyDecision,
  shouldExtractNotableFact,
  type TakeawayTestSuite,
} from "@app/tests/takeaway-evals/lib/types";

export const mixedExtractionSuite: TakeawayTestSuite = {
  name: "mixed-extraction",
  description:
    "Tests for multi-category extraction from rich documents and re-analysis",
  testCases: [
    // ── Full meeting notes ────────────────────────────────────────────────────

    {
      scenarioId: "full-meeting-notes",
      document: {
        id: "doc-mix-1",
        title: "Sprint planning",
        type: "slack",
        text: [
          "Alice: Let's go over the sprint plan.",
          "Bob: I'll finish the payment integration by Wednesday.",
          "Carol: I'll handle the email notification system. Should be done by Thursday.",
          "Alice: Good. Also, we found out that the Stripe API rate limit is 100 requests per second for our plan.",
          "Bob: That's tight. We decided to implement request batching to stay under the limit.",
          "Carol: Agreed. Also, our test coverage is at 72% — we should aim for 80% by end of sprint.",
          "Alice: I'll set up the CI check for the coverage threshold.",
        ].join("\n"),
        uri: "https://example.com/doc-mix-1",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      expectedAssertions: [
        minActionItems(3),
        shouldExtractActionItem("payment", {
          assigneeUserId: "user-bob",
        }),
        shouldExtractActionItem("email notification", {
          assigneeUserId: "user-carol",
        }),
        shouldExtractActionItem("CI", {
          assigneeUserId: "user-alice",
        }),
        shouldExtractNotableFact("100 requests"),
        shouldExtractNotableFact("72%"),
        shouldExtractKeyDecision("batching", { status: "decided" }),
      ],
      judgeCriteria: `A rich meeting with all three categories present:
- Action items: Bob (payment), Carol (email notifications), Alice (CI check)
- Notable facts: Stripe rate limit (100 req/s), current test coverage (72%)
- Key decision: implement request batching (decided)

Score 0 if fewer than 2 categories have correct extractions.
Score 1 if action items are partially correct but other categories are missing.
Score 2 if most items are correct across all categories.
Score 3 if all action items, notable facts, and the key decision are correctly extracted.`,
    },

    // ── Empty/minimal document ────────────────────────────────────────────────

    {
      scenarioId: "empty-document",
      document: {
        id: "doc-mix-2",
        title: "Quick hello",
        type: "slack",
        text: [
          "Alice: Hey Bob, are you free for lunch?",
          "Bob: Sure, let's go at noon.",
        ].join("\n"),
        uri: "https://example.com/doc-mix-2",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
      ],
      expectedAssertions: [],
      judgeCriteria: `This is casual small talk with no action items, notable facts, or key
decisions. The system should return empty or near-empty arrays.

Score 0 if multiple spurious takeaways are extracted.
Score 1 if one spurious item is extracted.
Score 2 if empty or only one borderline item.
Score 3 if completely empty extraction (ideal for this scenario).`,
    },

    // ── Re-analysis with carry-forward ────────────────────────────────────────

    {
      scenarioId: "re-analysis-carry-forward",
      document: {
        id: "doc-mix-3",
        title: "Updated sprint planning",
        type: "slack",
        text: [
          "Alice: Sprint update — Bob finished the payment integration, great work!",
          "Bob: Thanks. Carol, how's the email system going?",
          "Carol: Still working on it, should be done tomorrow. Also, we got confirmation that the Stripe rate limit will be increased to 500 req/s next month.",
          "Alice: Nice. I also need to set up the monitoring alerts for the new payment service.",
        ].join("\n"),
        uri: "https://example.com/doc-mix-3",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      previousVersion: {
        actionItems: [
          {
            sId: "prev-ai-1",
            shortDescription: "Finish payment integration",
            assigneeUserId: "user-bob",
            assigneeName: "Bob Chen",
            status: "open",
            detectedDoneAt: null,
            detectedDoneRationale: null,
          },
          {
            sId: "prev-ai-2",
            shortDescription: "Handle email notification system",
            assigneeUserId: "user-carol",
            assigneeName: "Carol Davis",
            status: "open",
            detectedDoneAt: null,
            detectedDoneRationale: null,
          },
        ],
        notableFacts: [
          {
            sId: "prev-nf-1",
            shortDescription:
              "Stripe API rate limit is 100 requests per second",
            relevantUserIds: [],
          },
        ],
        keyDecisions: [
          {
            sId: "prev-kd-1",
            shortDescription: "Implement request batching for Stripe API calls",
            relevantUserIds: [],
            status: "decided",
          },
        ],
      },
      expectedAssertions: [
        shouldExtractActionItem("payment", { status: "done" }),
        shouldExtractActionItem("email", { status: "open" }),
        shouldExtractActionItem("monitoring"),
      ],
      judgeCriteria: `IMPORTANT CONTEXT: This is a re-analysis scenario. The system was given a
previous version of extracted takeaways (action items, notable facts, key decisions) and is
expected to carry forward previously extracted items while updating them based on new information
in the document. Items from the previous version that still appear in the output are NOT
hallucinations — they are intentionally carried forward. Only items that have no basis in
either the document or the previous version would be hallucinations.

Evaluate the action items only (the primary focus of this test):
- Payment integration should transition to "done" — Bob finished it
- Email notification system stays "open" — Carol is still working on it
- New action item: Alice needs to set up monitoring alerts for the payment service

Notable facts and key decisions carried forward from the previous version (such as the Stripe
rate limit or request batching decision) are expected and correct behavior.

Score 0 if action item status transitions are wrong (payment not marked done, or email marked done).
Score 1 if statuses are partially correct or the new monitoring item is missing.
Score 2 if all three action items are present with correct statuses.
Score 3 if action items are perfect and carried-forward notable facts/decisions are reasonable.`,
    },
  ],
};
