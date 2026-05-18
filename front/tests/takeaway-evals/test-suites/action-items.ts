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
        }),
        shouldExtractActionItem("review", {
          assigneeUserId: "user-alice",
        }),
        shouldExtractActionItem("monitoring", {
          assigneeUserId: "user-carol",
        }),
      ],
      judgeCriteria: `Three clear action items with explicit assignees:
- Bob commits to writing the migration script → action item assigned to user-bob
- Alice commits to reviewing the PR → action item assigned to user-alice
- Carol commits to updating dashboards → action item assigned to user-carol

Score 0 if fewer than 2 action items extracted.
Score 1 if items extracted but assignees are wrong.
Score 2 if all items extracted, most assignees correct.
Score 3 if all 3 items extracted with correct assignees.`,
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

    // ── Ownership from context + multiple parallel tracks ────────────────────

    {
      scenarioId: "ownership-and-parallel-tracks",
      document: {
        id: "doc-7",
        title: "Ship requirements discussion",
        type: "slack",
        text: [
          "$title: Thread in #initiative-projects: @matteo @rcs @ed Looking at the ship requirements from last meeting, we are getting dangerously close to have everything covered. @rcs is owning the opt-in part while polishing the todo autogeneration workflow.",
          ">> @seb [10:21]",
          "@matteo @rcs @ed Looking at the ship requirements from last meeting, we are getting dangerously close to have everything covered. @rcs is owning the opt-in part while polishing the todo autogeneration workflow.",
          "",
          "Now that we have the TODOs, having played a bit with them, personally, I will iterate on the humans UX / UI for them, notably:",
          "",
          "Ability to manually add a TODO",
          "Ability to manually edit any TODO (including re-assignment)",
          "Always show the button to start working on todo | the button to see the conversation",
          "Allow to add a custom message and pick a custom agent when starting to work on a todo",
          "Show the TODO with a custom UI in the conversation (instead of todo ID: ptr_X134YT34)",
          "",
          ">> @rcs  [10:42 AM]",
          "Aligned on 1), 2) to have the symmetric between human/agents from collaboration",
          "For 3) This could add a lot of visual burden in the UI, so unless we manage to find a clean way, I would not do it. I believe the current on hover is enough to be self-discoverable",
          "Aligned on 4), and 5)",
          "",
          ">> @seb  [10:48 AM]",
          "I believe the current on hover is enough to be self-discoverableDoesnt' work on mobile, and actually I wanted to do this because jd said it didn't discover via hover.",
          "",
          ">> @rcs  [10:51 AM]",
          "As you seem to already have an idea to make this not-cluttered, let's do it!",
          "",
          ">> @seb  [12:45 PM]",
          "After some discussions with @ed, I'll wait a bit on some item for more brainstorming.",
          "",
          "I'll do 3, 4 and 5 while we think more about 1 and 2.",
          "",
          ">> @rcs  [1:26 PM]",
          "Could you share the tldr; on why not 1 and 2 now? :pray:",
        ].join("\n"),
        uri: "https://example.com/doc-7",
      },
      members: [
        {
          sId: "zxcvb",
          fullName: "Rémy-Christophe Schermesser",
          email: "rcs@dust.tt",
        },
        {
          sId: "abcdef",
          fullName: "Sebastien Flory",
          email: "seb@dust.tt",
        },
        {
          sId: "qwert",
          fullName: "Edouard Wautier",
          email: "ed@dust.tt",
        },
      ],
      expectedAssertions: [
        shouldExtractActionItem("show", {
          assigneeUserId: "abcdef",
        }),
        shouldExtractActionItem("opt-in", {
          assigneeUserId: "zxcvb",
        }),
        shouldNotExtractActionItem("1 and 2"),
        maxActionItems(4),
      ],
      judgeCriteria: `Seb commits to working on items 3, 4, and 5 of the TODO UX improvements, and defers 1 and 2 to further brainstorming.
Rcs is described as owning the opt-in part.

- Rcs's opt-in ownership → action item assigned to user-rcs
- Seb's commitment to items 3, 4 and 5 → action items assigned to user-seb; these can be grouped or individual
- Items 1 and 2 (manually add / edit TODO) are explicitly deferred — NOT action items

Score 0 if deferred items 1 and 2 are extracted as action items.
Score 1 if Rcs's opt-in ownership is missing.
Score 2 if Seb's items are extracted but Rcs's item is missing or wrongly assigned.
Score 3 if Rcs's opt-in item and Seb's items 3/4/5 are correctly extracted, items 1 and 2 are not.`,
    },

    // ── Re-analysis of same document must not duplicate items ─────────────────

    {
      scenarioId: "idempotent-re-analysis",
      document: {
        id: "doc-8",
        title: "Sprint planning",
        type: "slack",
        text: [
          "Alice: I'll write the migration script for the users table by Friday",
          "Bob: I'll review it once it's ready",
        ].join("\n"),
        uri: "https://example.com/doc-8",
      },
      members: [
        { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
        { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
      ],
      previousVersion: {
        actionItems: [
          {
            sId: "prev-migr-1",
            shortDescription: "Write the migration script for the users table",
            assigneeUserId: "user-alice",
            assigneeName: "Alice Martin",
            detectedCreationRationale:
              "Alice committed to writing the migration script by Friday",
          },
          {
            sId: "prev-review-1",
            shortDescription: "Review the migration PR once it's ready",
            assigneeUserId: "user-bob",
            assigneeName: "Bob Chen",
            detectedCreationRationale:
              "Bob committed to reviewing the migration PR",
          },
        ],
      },
      expectedAssertions: [
        shouldPreserveSId("actionItem", "prev-migr-1"),
        shouldPreserveSId("actionItem", "prev-review-1"),
        maxActionItems(2),
      ],
      judgeCriteria: `This document was already analyzed once and produced two action items (Alice:
migration script, Bob: review PR). On this second pass, both items are already
tracked in the 'Previously tracked' list. The document is unchanged, so nothing
has changed.

Score 0 if the same items are re-extracted as NEW action items (duplicates created).
Score 1 if sIds from the previous version are not preserved.
Score 2 if no duplicates but the output has extra spurious items.
Score 3 if the two existing items are preserved with their original sIds and no new items are added.`,
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
        }),
        maxActionItems(1),
      ],
      judgeCriteria: `One new task assigned:
- Bob asked to update the runbook

Score 0 if no tasks are extracted.
Score 3 if the task item is correct and no spurious extractions.`,
    },
  ],
};
