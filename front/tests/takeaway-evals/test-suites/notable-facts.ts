import {
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
  ],
};
