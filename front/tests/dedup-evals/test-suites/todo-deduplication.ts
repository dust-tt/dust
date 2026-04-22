import {
  type DedupTestSuite,
  shouldBeNew,
  shouldMatchExisting,
} from "@app/tests/dedup-evals/lib/types";

export const todoDeduplicationSuite: DedupTestSuite = {
  name: "todo-deduplication",
  description:
    "Semantic deduplication of project TODO candidates against existing TODOs",
  testCases: [
    // ── Exact and near-exact duplicates ─────────────────────────────────────
    {
      scenarioId: "exact-duplicate",
      existingTodos: [
        { sId: "existing-1", text: "Set up CI/CD pipeline for staging" },
      ],
      candidates: [
        { itemId: "c-0", text: "Set up CI/CD pipeline for staging" },
      ],
      expectedMatches: [shouldMatchExisting(0, "existing-1")],
      judgeCriteria: `The candidate text is identical to the existing TODO.
This is the simplest case — the system must recognize it as a duplicate.

Score 0 if candidate is not matched to existing-1.
Score 3 if correctly matched.`,
    },

    {
      scenarioId: "semantic-duplicate",
      existingTodos: [
        { sId: "existing-1", text: "Set up CI/CD pipeline for staging" },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Configure automated build and deployment for the staging environment",
        },
      ],
      expectedMatches: [shouldMatchExisting(0, "existing-1")],
      judgeCriteria: `The candidate describes the same task as the existing TODO — setting up
automated builds/deployments for staging — using completely different words.
The system must recognize semantic equivalence despite different wording.

Score 0 if candidate is not matched.
Score 2 if matched but to the wrong existing TODO (if multiple existed).
Score 3 if correctly matched to existing-1.`,
    },

    // ── Genuinely new items ─────────────────────────────────────────────────

    {
      scenarioId: "genuinely-new",
      existingTodos: [
        { sId: "existing-1", text: "Set up CI/CD pipeline for staging" },
        {
          sId: "existing-2",
          text: "Add unit tests for the authentication module",
        },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Implement dark mode toggle in user settings",
        },
      ],
      expectedMatches: [shouldBeNew(0)],
      judgeCriteria: `The candidate (dark mode toggle) is completely unrelated to either
existing TODO (CI/CD and auth tests). It must NOT be matched.

Score 0 if candidate is matched to any existing TODO.
Score 3 if correctly identified as new.`,
    },

    // ── Partial overlap but distinct tasks ──────────────────────────────────

    {
      scenarioId: "partial-overlap-distinct",
      existingTodos: [
        {
          sId: "existing-1",
          text: "Set up continuous integration pipeline with GitHub Actions",
        },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Configure continuous deployment to production with rollback support",
        },
      ],
      expectedMatches: [shouldBeNew(0)],
      judgeCriteria: `The existing TODO is about CI (continuous integration — building and testing),
while the candidate is about CD to production with rollback. These are related but
distinct tasks — CI and CD are different pipeline stages with different concerns.

Score 0 if the candidate is incorrectly matched to the CI TODO.
Score 2 if correctly identified as new but reasoning is unclear.
Score 3 if correctly identified as new with clear reasoning about CI vs CD distinction.`,
    },

    // ── Mixed batch: some duplicates, some new ─────────────────────────────

    {
      scenarioId: "mixed-batch",
      existingTodos: [
        {
          sId: "existing-1",
          text: "Migrate database from MySQL to PostgreSQL",
        },
        { sId: "existing-2", text: "Write API documentation for v2 endpoints" },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Move the database to PostgreSQL from the current MySQL setup",
        },
        {
          itemId: "c-1",
          text: "Add rate limiting to the public API",
        },
        {
          itemId: "c-2",
          text: "Document all v2 API endpoints with request/response examples",
        },
      ],
      expectedMatches: [
        shouldMatchExisting(0, "existing-1"),
        shouldBeNew(1),
        shouldMatchExisting(2, "existing-2"),
      ],
      judgeCriteria: `Three candidates against two existing TODOs:
- c-0 (MySQL→PostgreSQL migration) is a semantic duplicate of existing-1 → must match.
- c-1 (rate limiting) is entirely unrelated → must be new.
- c-2 (API docs for v2) is a semantic duplicate of existing-2 → must match.

Score 0 if any match decision is wrong.
Score 1 if one match is wrong.
Score 2 if all matches are correct but the mapping points to wrong sIds.
Score 3 if all three decisions are correct with proper sId mappings.`,
    },

    // ── Many existing TODOs, one specific match ─────────────────────────────

    {
      scenarioId: "many-existing-one-match",
      existingTodos: [
        { sId: "existing-1", text: "Upgrade Node.js to version 22" },
        {
          sId: "existing-2",
          text: "Add Sentry error monitoring to production",
        },
        {
          sId: "existing-3",
          text: "Refactor the payment processing module to use Stripe API v3",
        },
        { sId: "existing-4", text: "Set up end-to-end tests with Playwright" },
        {
          sId: "existing-5",
          text: "Create a shared component library for the design system",
        },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Update the payment module to integrate with Stripe's latest API version",
        },
      ],
      expectedMatches: [shouldMatchExisting(0, "existing-3")],
      judgeCriteria: `The candidate is about updating the payment module to use Stripe's latest API.
Among 5 existing TODOs, only existing-3 is about refactoring the payment module for Stripe
API v3 — the same task described differently. The system must:
1. Not be distracted by the other 4 unrelated TODOs.
2. Match specifically to existing-3 (not any other sId).

Score 0 if no match or matched to wrong existing TODO.
Score 2 if matched to existing-3 but reasoning is unclear.
Score 3 if correctly matched to existing-3.`,
    },

    // ── to_know category: key decision deduplication ────────────────────────

    {
      scenarioId: "key-decision-dedup",
      existingTodos: [
        {
          sId: "existing-1",
          text: "We decided to use PostgreSQL as our primary database for the new service",
        },
        {
          sId: "existing-2",
          text: "The team agreed to adopt TypeScript strict mode across all projects",
        },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Database choice: PostgreSQL was selected as the main database for the new service",
        },
        {
          itemId: "c-1",
          text: "We are going to use Redis for caching in the new service",
        },
      ],
      expectedMatches: [shouldMatchExisting(0, "existing-1"), shouldBeNew(1)],
      judgeCriteria: `Two candidates in the "to_know" category:
- c-0 restates the PostgreSQL decision from existing-1 with different phrasing → duplicate.
- c-1 is about Redis caching, which is a separate decision not covered by any existing TODO → new.

Score 0 if c-0 is not matched or c-1 is incorrectly matched.
Score 2 if both decisions are correct but c-0 maps to wrong sId.
Score 3 if c-0 correctly maps to existing-1 and c-1 is new.`,
    },

    // ── Granularity mismatch: sub-task of existing ─────────────────────────

    {
      scenarioId: "granularity-mismatch",
      existingTodos: [
        {
          sId: "existing-1",
          text: "Migrate the database from MySQL to PostgreSQL",
        },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Export all MySQL data and import it into the new PostgreSQL instance",
        },
      ],
      expectedMatches: [shouldMatchExisting(0, "existing-1")],
      judgeCriteria: `The candidate describes a sub-step of the existing migration TODO.
Completing the existing TODO would make the candidate redundant — they are the same
core task at different granularity levels.

Score 0 if the candidate is treated as new.
Score 2 if matched but reasoning doesn't address the granularity difference.
Score 3 if correctly matched to existing-1.`,
    },

    // ── Same domain, opposite action ───────────────────────────────────────

    {
      scenarioId: "same-domain-opposite-action",
      existingTodos: [
        {
          sId: "existing-1",
          text: "Upgrade the Stripe integration to API v3",
        },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Remove the Stripe integration and switch to a custom payment flow",
        },
      ],
      expectedMatches: [shouldBeNew(0)],
      judgeCriteria: `Both items mention Stripe payments, but the actions are opposite:
one upgrades Stripe, the other removes it entirely. These are clearly distinct tasks
that could both appear on a backlog. Keyword overlap should not cause a false match.

Score 0 if the candidate is matched to existing-1.
Score 3 if correctly identified as new.`,
    },

    // ── Temporal variation: same lifecycle task ────────────────────────────

    {
      scenarioId: "temporal-variation-same-task",
      existingTodos: [
        { sId: "existing-1", text: "Fix the login bug that causes 500 errors" },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Deploy the hotfix for the login 500 error to production",
        },
      ],
      expectedMatches: [shouldMatchExisting(0, "existing-1")],
      judgeCriteria: `The existing TODO is about fixing a login bug. The candidate is about
deploying that fix. These are the same lifecycle task — completing the fix inherently
includes deploying it. They are redundant.

Score 0 if the candidate is treated as new.
Score 2 if matched but reasoning is unclear.
Score 3 if correctly matched to existing-1.`,
    },

    // ── Cross-match confusion: multiple plausible pairings ─────────────────

    {
      scenarioId: "cross-match-confusion",
      existingTodos: [
        {
          sId: "existing-1",
          text: "Write API documentation for the REST endpoints",
        },
        {
          sId: "existing-2",
          text: "Write a user guide for the admin dashboard",
        },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Document all REST API endpoints with request/response examples",
        },
        {
          itemId: "c-1",
          text: "Create a step-by-step admin dashboard guide for new users",
        },
      ],
      expectedMatches: [
        shouldMatchExisting(0, "existing-1"),
        shouldMatchExisting(1, "existing-2"),
      ],
      judgeCriteria: `Both candidates are about "writing documentation" and both existing TODOs
are about "writing documentation." The model must pair them correctly:
- c-0 (REST API docs) → existing-1 (API docs), NOT existing-2
- c-1 (admin dashboard guide) → existing-2 (user guide), NOT existing-1

A swapped pairing is wrong even though both would be "matches."

Score 0 if any pairing is swapped or missing.
Score 2 if both matched but one points to the wrong sId.
Score 3 if both correctly paired: c-0→existing-1 and c-1→existing-2.`,
    },

    // ── Large candidate batch: index tracking ──────────────────────────────

    {
      scenarioId: "large-batch-index-tracking",
      existingTodos: [
        {
          sId: "existing-1",
          text: "Set up Datadog monitoring for API latency",
        },
        { sId: "existing-2", text: "Add input validation to the signup form" },
      ],
      candidates: [
        {
          itemId: "c-0",
          text: "Implement WebSocket support for real-time notifications",
        },
        {
          itemId: "c-1",
          text: "Add server-side rendering for the landing page",
        },
        {
          itemId: "c-2",
          text: "Configure Datadog APM to track API response times",
        },
        { itemId: "c-3", text: "Create a CLI tool for database migrations" },
        { itemId: "c-4", text: "Validate user input on the registration form" },
        {
          itemId: "c-5",
          text: "Set up automated backups for the production database",
        },
      ],
      expectedMatches: [
        shouldBeNew(0),
        shouldBeNew(1),
        shouldMatchExisting(2, "existing-1"),
        shouldBeNew(3),
        shouldMatchExisting(4, "existing-2"),
        shouldBeNew(5),
      ],
      judgeCriteria: `Six candidates against two existing TODOs. The model must:
- Match c-2 (Datadog APM) to existing-1 (Datadog monitoring) — same observability task.
- Match c-4 (registration form validation) to existing-2 (signup form validation) — same task.
- Correctly identify c-0, c-1, c-3, c-5 as new — none overlap with existing TODOs.

This tests index tracking accuracy in a larger batch. Getting the indices wrong
(e.g., reporting candidate 3 instead of 2) is a common failure mode.

Score 0 if more than one decision is wrong.
Score 1 if exactly one decision is wrong.
Score 2 if all decisions correct but one sId mapping is wrong.
Score 3 if all 6 candidates are correctly classified with proper sId mappings.`,
    },
  ],
};
