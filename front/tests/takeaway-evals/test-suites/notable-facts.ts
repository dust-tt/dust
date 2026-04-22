import {
  maxKeyDecisions,
  maxNotableFacts,
  shouldExtractNotableFact,
  type TakeawayTestSuite,
} from "@app/tests/takeaway-evals/lib/types";

export const notableFactsSuite: TakeawayTestSuite = {
  name: "notable-facts",
  description: "Tests for notable fact extraction from documents",
  testCases: [
    // ── Key constraint shared in discussion ───────────────────────────────────

    {
      scenarioId: "key-constraint",
      document: {
        id: "doc-nf-1",
        title: "Platform constraints",
        type: "slack",
        text: [
          "Alice: Heads up — I checked with the infrastructure team and our current load balancer has a hard limit of 10,000 concurrent WebSocket connections.",
          "Bob: Good to know. That means we need to plan for horizontal scaling before the product launch.",
          "Carol: The launch is scheduled for March 15th, so we have about 6 weeks.",
        ].join("\n"),
        uri: "https://example.com/doc-nf-1",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      expectedAssertions: [
        shouldExtractNotableFact("10,000"),
        shouldExtractNotableFact("March 15"),
      ],
      judgeCriteria: `Two notable facts worth remembering:
- The load balancer has a 10,000 concurrent WebSocket connection limit
- The product launch is scheduled for March 15th

Score 0 if neither fact is extracted.
Score 1 if only one fact is extracted.
Score 2 if both are extracted but descriptions are unclear.
Score 3 if both facts are clearly extracted with good descriptions.`,
    },

    // ── Knowledge document with significant facts ─────────────────────────────

    {
      scenarioId: "knowledge-doc-facts",
      document: {
        id: "doc-nf-2",
        title: "Service architecture overview",
        type: "project_knowledge",
        text: [
          "# Service Architecture",
          "",
          "Our payment service processes approximately 50,000 transactions per day.",
          "The service is deployed in us-east-1 and eu-west-1 regions for redundancy.",
          "All PII data is encrypted at rest using AES-256.",
          "The maximum allowed response time for payment endpoints is 200ms (P99).",
        ].join("\n"),
        uri: "https://example.com/doc-nf-2",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
      ],
      expectedAssertions: [
        shouldExtractNotableFact("50,000"),
        shouldExtractNotableFact("AES-256"),
        shouldExtractNotableFact("200ms"),
        maxNotableFacts(4),
      ],
      judgeCriteria: `A knowledge document with several important architectural facts:
- 50,000 daily transactions
- Multi-region deployment (us-east-1 and eu-west-1)
- AES-256 encryption for PII
- 200ms P99 latency requirement

Score 0 if fewer than 2 facts extracted.
Score 1 if only 2 facts extracted.
Score 2 if 3+ facts extracted with reasonable descriptions.
Score 3 if all key facts extracted with clear, concise descriptions.`,
    },

    // ── Casual conversation: zero notable facts ──────────────────────────────

    {
      scenarioId: "casual-conversation-no-facts",
      document: {
        id: "doc-nf-3",
        title: "Water cooler chat",
        type: "slack",
        text: [
          "Alice: Did anyone watch the game last night?",
          "Bob: Yeah, it was a great match. I can't believe the comeback in the second half.",
          "Carol: I missed it! Was going to watch the replay tonight.",
          "Alice: Also, happy birthday Bob! We should grab lunch to celebrate.",
          "Bob: Thanks! Let's do it. How about that new ramen place?",
          "Carol: I'm in. Let me know the time.",
        ].join("\n"),
        uri: "https://example.com/doc-nf-3",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      expectedAssertions: [maxNotableFacts(0), maxKeyDecisions(0)],
      judgeCriteria: `Purely social conversation with no project-relevant information.
Nothing here would change how anyone plans their work two weeks from now.

Score 0 if any notable facts are extracted.
Score 1 if a key decision or action item is extracted from the lunch plan.
Score 2 if one borderline item appears (e.g., birthday).
Score 3 if zero notable facts and zero key decisions are extracted.`,
    },

    // ── Noisy debugging thread with one real fact ─────────────────────────────

    {
      scenarioId: "debugging-thread-one-fact",
      document: {
        id: "doc-nf-4",
        title: "Production incident thread",
        type: "slack",
        text: [
          "Alice: The API is returning 502 errors for some users since 10am",
          "Bob: Checking the logs now... I see timeouts on the database connection pool",
          "Alice: Could it be the connection limit? We bumped traffic yesterday with the new campaign",
          "Bob: Found it — we're hitting the max_connections limit on the PostgreSQL instance. It's set to 100 but we need at least 200 with current traffic.",
          "Carol: I can bump it. Done — set to 300 to give us headroom.",
          "Alice: Confirmed, 502s are gone. Let's monitor for the next hour.",
          "Bob: All clear. Root cause was the PostgreSQL max_connections limit at 100 was too low for our current traffic volume of ~15,000 requests per minute.",
        ].join("\n"),
        uri: "https://example.com/doc-nf-4",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      expectedAssertions: [
        shouldExtractNotableFact("15,000"),
        maxNotableFacts(2),
        maxKeyDecisions(0),
      ],
      judgeCriteria: `A noisy debugging thread with lots of intermediate facts. Most are transient
investigation context (502 errors, checking logs, timeouts). The durable facts are:
- Current traffic volume: ~15,000 requests per minute
- PostgreSQL max_connections was bumped to 300 (acceptable but borderline)

The 502 errors, the debugging steps, and "it's fixed now" are NOT notable — they're
ephemeral incident context that won't matter in two weeks.

Score 0 if 3+ notable facts are extracted (over-extraction from noise).
Score 1 if the traffic volume fact is missing.
Score 2 if the traffic volume is extracted with at most one other fact.
Score 3 if only the traffic volume (and optionally the new connection limit) are extracted, with zero key decisions.`,
    },

    // ── Cross-category: fact that could leak as action item ──────────────────

    {
      scenarioId: "fact-not-action-item",
      document: {
        id: "doc-nf-5",
        title: "Vendor update",
        type: "slack",
        text: [
          "Alice: FYI — our AWS contract renewed automatically last week. The new rate is $42,000/month, up from $38,000.",
          "Bob: Ouch, that's a 10.5% increase. Good to know for budgeting.",
          "Carol: Also, the AWS support tier was downgraded to Business from Enterprise as part of the cost review.",
        ].join("\n"),
        uri: "https://example.com/doc-nf-5",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      expectedAssertions: [
        shouldExtractNotableFact("42,000"),
        maxNotableFacts(2),
      ],
      judgeCriteria: `This thread contains facts, not action items. Nobody committed to doing
anything — they're sharing information. The model should extract notable facts
(the new AWS rate, the support tier downgrade) but NOT create action items.

Score 0 if action items are extracted from this informational update.
Score 1 if the cost increase fact is missing.
Score 2 if facts are correct but spurious action items appear.
Score 3 if notable facts are extracted correctly with no action items.`,
    },
  ],
};
