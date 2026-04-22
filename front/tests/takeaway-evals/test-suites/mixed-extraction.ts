import {
  maxKeyDecisions,
  maxNotableFacts,
  minActionItems,
  shouldExtractActionItem,
  shouldExtractKeyDecision,
  shouldExtractNotableFact,
  shouldPreserveSId,
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
        shouldExtractKeyDecision("batching", { status: "decided" }),
      ],
      judgeCriteria: `A rich meeting with all three categories present:
- Action items: Bob (payment), Carol (email notifications), Alice (CI check)
- Notable fact: Stripe rate limit (100 req/s). The 72% coverage is ephemeral and acceptable to skip.
- Key decision: implement request batching (decided)

Score 0 if fewer than 2 categories have correct extractions.
Score 1 if action items are partially correct but other categories are missing.
Score 2 if most items are correct across all categories.
Score 3 if all action items, the Stripe rate limit fact, and the key decision are correctly extracted.`,
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
        shouldPreserveSId("actionItem", "prev-ai-1"),
        shouldPreserveSId("actionItem", "prev-ai-2"),
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

    // ── Small amount of items detected ────────────────────────────────────────
    {
      scenarioId: "real-world-bug-report-thread",
      document: {
        id: "slack-C09T7N4S6GG-thread-1776758009.764779",
        title: "initiative-projects-thread-2026-04-21_07h53",
        type: "slack",
        text: "$title: Thread in #initiative-projects: @seb the + button not working on team bi-weekly project (top right) Attached file : Screenshot 2026-04-21 at 09.53.09.png ( imag...\n$createdAt: 2026-04-21T07:53:29.000Z\n$updatedAt: 2026-04-21T09:22:09.000Z\n>> @Ambra [20260421 07:53]:\n@seb the + button not working on team bi-weekly project (top right)\nAttached file : Screenshot 2026-04-21 at 09.53.09.png ( image/png )\n>> @rcs [20260421 08:00]:\nSeb is OoO.\n\nIt's not a button, it's to show that there are more members of the project.\nAttached file : image.png ( image/png )\n>> @rcs [20260421 08:01]:\nCould you invite me to the project so I can have a look? I suppose it's a display issue when the number is bigger than 9\n>> @ed [20260421 08:15]:\n@rcs also, I think the component is not super well calibrated to display that many people, mlaybe reduce to 5 max?\n>> @rcs [20260421 08:16]:\nYeah, it's too small. I'll fix both at the same time!\n>> @rcs [20260421 08:25]:\n@Ambra I confirm it means \"there are more than 10 people not showed\". I'll think of something to improve it\n>> @rcs [20260421 09:22]:\nBoth are fixed =&gt; <https://github.com/dust-tt/dust/pull/24610>\n",
        uri: "https://dust4ai.slack.com/archives/C09T7N4S6GG/p1776758009764779?thread_ts=1776758009.764779&cid=C09T7N4S6GG",
      },
      members: [
        { sId: "user-seb", fullName: "Sébastien Flory", email: "seb@dust.tt" },
        {
          sId: "user-rcs",
          fullName: "Rémy-Christophe Schermesser",
          email: "rcs@dust.tt",
        },
        {
          sId: "user-ed",
          fullName: "Edouard Wautier",
          email: "ed@dust.tt",
        },
      ],
      expectedAssertions: [
        minActionItems(1),
        shouldExtractActionItem("display", {
          assigneeUserId: "user-rcs",
          status: "done",
        }),
        maxNotableFacts(0),
        maxKeyDecisions(1),
      ],
      judgeCriteria: `A real-world Slack thread about a UI bug on the project members display.
This is a short troubleshooting thread — sparse extraction is ideal.

- Action item: rcs fixed the display issue (done — PR 24610 merged). This is the only
  clearly extractable takeaway.
- Notable facts: none expected. The conversation is debugging context, not durable knowledge.
- Key decision: reducing displayed avatars to 5 max is acceptable but optional — it's a
  minor UI tweak, not a project-level decision.

Score 0 if the action item is missing or assigned to the wrong person.
Score 1 if the action item is present but not marked as done, or multiple spurious items extracted.
Score 2 if the action item is correct with status done and extraction is sparse.
Score 3 if only the action item is extracted (and optionally the 5-max key decision), with zero notable facts.`,
    },
  ],
};
