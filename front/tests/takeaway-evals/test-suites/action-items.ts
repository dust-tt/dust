import {
  maxActionItems,
  shouldExtractActionItem,
  shouldNotAssignTo,
  shouldNotExtractActionItem,
  shouldPreserveSId,
  type TakeawayTestSuite,
} from "@app/tests/takeaway-evals/lib/types";

export const actionItemsSuite: TakeawayTestSuite = {
  name: "action-items",
  description:
    "Tests for action item extraction from various document types and scenarios",
  testCases: [
    // ── Explicit task assignment ──────────────────────────────────────────────

    {
      scenarioId: "explicit-task-assignment",
      document: {
        id: "doc-1",
        title: "Team standup",
        type: "slack",
        text: [
          "Alice: Hey team, quick standup update",
          "Bob: I'll write the migration script for the users table by Friday",
          "Alice: Great, and I'll review the PR once it's ready",
          "Carol: I need to update the monitoring dashboards this week",
        ].join("\n"),
        uri: "https://example.com/doc-1",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
        { sId: "user-carol", fullName: "Carol Davis", email: "carol@co.com" },
      ],
      expectedAssertions: [
        shouldExtractActionItem("migration", {
          assigneeUserId: "user-bob",
          status: "open",
        }),
        shouldExtractActionItem("review", {
          assigneeUserId: "user-alice",
          status: "open",
        }),
        shouldExtractActionItem("monitoring", {
          assigneeUserId: "user-carol",
          status: "open",
        }),
      ],
      judgeCriteria: `Three clear action items with explicit assignees:
- Bob commits to writing the migration script → action item assigned to user-bob
- Alice commits to reviewing the PR → action item assigned to user-alice
- Carol commits to updating dashboards → action item assigned to user-carol

Score 0 if fewer than 2 action items extracted.
Score 1 if items extracted but assignees are wrong.
Score 2 if all items extracted, most assignees correct.
Score 3 if all 3 items extracted with correct assignees and open status.`,
    },

    // ── Agent response should NOT become action item ──────────────────────────

    {
      scenarioId: "agent-response-not-action-item",
      document: {
        id: "doc-2",
        title: "Help with deploy",
        type: "project_conversation",
        text: [
          "Alice: @dust Can you help me debug the deployment issue?",
          "Dust Agent: I'll look into the deployment logs and check for errors. Based on the logs, the issue is a missing environment variable REDIS_URL. You should add it to your .env file.",
          "Alice: Got it. I'll add the REDIS_URL environment variable to the production .env file before the next deploy.",
        ].join("\n"),
        uri: "https://example.com/doc-2",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
      ],
      expectedAssertions: [
        shouldExtractActionItem("REDIS_URL", {
          assigneeUserId: "user-alice",
        }),
        shouldNotExtractActionItem("look into"),
        shouldNotExtractActionItem("check for errors"),
        maxActionItems(1),
      ],
      judgeCriteria: `This is a conversation with an AI agent. The agent's offer to "look into logs"
and "check for errors" is NOT an action item — it's being handled in real-time.
Alice's commitment to add the env var IS an action item.

Score 0 if the agent's responses are extracted as action items.
Score 1 if Alice's action item is missing.
Score 2 if Alice's item is extracted but agent items also appear.
Score 3 if only Alice's action item is extracted, agent responses correctly ignored.`,
    },

    // ── Status transition to done ─────────────────────────────────────────────

    {
      scenarioId: "status-transition-to-done",
      document: {
        id: "doc-3",
        title: "Sprint review",
        type: "slack",
        text: [
          "Bob: Quick update — the migration script is done, deployed to staging yesterday",
          "Alice: I've reviewed the PR, looks good. Still need to update the API docs though",
        ].join("\n"),
        uri: "https://example.com/doc-3",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
      ],
      previousVersion: {
        actionItems: [
          {
            sId: "prev-action-1",
            shortDescription: "Write the migration script",
            assigneeUserId: "user-bob",
            assigneeName: "Bob Chen",
            status: "open",
            detectedDoneAt: null,
            detectedDoneRationale: null,
          },
          {
            sId: "prev-action-2",
            shortDescription: "Review the PR",
            assigneeUserId: "user-alice",
            assigneeName: "Alice Martin",
            status: "open",
            detectedDoneAt: null,
            detectedDoneRationale: null,
          },
        ],
        notableFacts: [],
        keyDecisions: [],
      },
      expectedAssertions: [
        shouldExtractActionItem("migration", { status: "done" }),
        shouldExtractActionItem("review", { status: "done" }),
        shouldExtractActionItem("API docs", { status: "open" }),
        shouldPreserveSId("actionItem", "prev-action-1"),
        shouldPreserveSId("actionItem", "prev-action-2"),
      ],
      judgeCriteria: `Two previously tracked action items should transition to done:
- The migration script is explicitly stated as done by Bob → status "done"
- The PR review is explicitly completed by Alice → status "done"
- A new action item for updating API docs should be created (status "open")

Score 0 if status transitions are wrong (done items shown as open or vice versa).
Score 1 if only one of the two items is correctly marked as done.
Score 2 if both done transitions are correct but the new API docs item is missing.
Score 3 if all 3 items present with correct statuses (2 done, 1 open).`,
    },

    // ── Invalid assignee should be filtered ───────────────────────────────────

    {
      scenarioId: "invalid-assignee-filtered",
      document: {
        id: "doc-4",
        title: "External discussion",
        type: "slack",
        text: [
          "Alice: I talked to Dave from the partner team, he said he'll send us the API specs",
          "Bob: Great, I'll integrate them once we get them",
        ].join("\n"),
        uri: "https://example.com/doc-4",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
      ],
      expectedAssertions: [
        shouldNotAssignTo("user-dave"),
        shouldExtractActionItem("integrate", {
          assigneeUserId: "user-bob",
        }),
      ],
      judgeCriteria: `Dave is not a project member, so any action item about sending API specs
should NOT have an assignee_user_id (Dave's ID should not appear). Bob's
commitment to integrate is valid with a correct assignee.

Score 0 if a non-member user ID appears as assignee.
Score 1 if Dave's action item has an invalid assignee.
Score 2 if assignee filtering is correct but Bob's item is missing.
Score 3 if Dave's action has no assignee_user_id and Bob's action is correctly assigned.`,
    },

    // ── Vague items should not be extracted ───────────────────────────────────

    {
      scenarioId: "vague-items-excluded",
      document: {
        id: "doc-5",
        title: "Brainstorm",
        type: "project_conversation",
        text: [
          "Alice: We should probably think about improving the onboarding flow sometime",
          "Bob: Yeah, it would be nice to have better error messages too",
          "Alice: Definitely something to consider. By the way, I'll push the hotfix for the login bug by EOD today.",
        ].join("\n"),
        uri: "https://example.com/doc-5",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
      ],
      expectedAssertions: [
        shouldNotExtractActionItem("onboarding"),
        shouldNotExtractActionItem("error messages"),
        shouldExtractActionItem("hotfix", {
          assigneeUserId: "user-alice",
          status: "open",
        }),
        maxActionItems(2),
      ],
      judgeCriteria: `The onboarding and error message mentions are vague aspirational comments,
NOT concrete commitments. Only Alice's hotfix commitment is a real action item.

Score 0 if vague items are extracted as action items.
Score 1 if the hotfix is missing.
Score 2 if the hotfix is extracted but vague items also appear.
Score 3 if only the hotfix is extracted as an action item.`,
    },

    // ── No inline completion should be registered ──────────────────────────────

    {
      scenarioId: "no-inline-completion-done",
      document: {
        id: "doc-6",
        title: "Morning update",
        type: "slack",
        text: [
          "Alice: Quick update — I fixed the login bug this morning, the patch is live.",
          "Bob: Thanks! I also deployed the rate limiter changes yesterday evening.",
          "Alice: Nice. Bob, can you also update the runbook with the new rate limits?",
        ].join("\n"),
        uri: "https://example.com/doc-6",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
      ],
      expectedAssertions: [
        shouldExtractActionItem("runbook", {
          assigneeUserId: "user-bob",
          status: "open",
        }),
        maxActionItems(1),
      ],
      judgeCriteria: `One new task assigned:
- Bob asked to update the runbook (open)

Score 0 if no tasks are extracted as open.
Score 3 if the task item are correct with right statuses and no spurious extractions.`,
    },
  ],
};
