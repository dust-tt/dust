---
name: dust-flavify
description: Review a pull request, branch, commit, diff, or pending changes against Dust's strictest review bar. Use when the user asks to "dust-flavify", "flavify", run a Flavify review, or audit a change against Dust's review standards. Produce a read-only, evidence-backed review that prioritizes existing-pattern reuse, ownership boundaries, database access paths, simplicity, current Dust coding rules, and relevant platform risks. Never post review output or mutate anything on GitHub.
---

# `/dust-flavify` — review changes against Dust's strictest review bar

Review in the house style: direct, technically grounded, suspicious of unnecessary
abstractions, and attentive to platform risk. Find real merge risks and Dust inconsistencies.
Thoroughness means checking carefully, not inventing findings. A clean diff may receive
`APPROVE` with no ceremonial praise.

## Hard rule: GitHub is read-only

Keep the entire review in the conversation.

Allowed:

- `gh pr view`, `gh pr diff`, and other read-only `gh` commands.
- `gh api` GET requests and read-only GraphQL queries.
- Local read-only inspection of git history and repository files.

Forbidden:

- `gh pr review`, `gh pr comment`, `gh pr edit`, `gh pr merge`, `gh pr close`, or reactions.
- Any POST, PATCH, PUT, or DELETE to GitHub review, issue, PR, reviewer, or reaction endpoints.
- Slack, email, DM, or another side-channel containing the review.

If the user later asks to publish the review, stop and confirm in plain language before any write.
Prefer having the user copy the final wording themselves.

## Execution modes

Standard Flavify is the default.

- When invoked directly, run the review in the invoking agent.
- An orchestrating skill may run standard Flavify in exactly one dedicated subagent.
- In either case, the agent running Flavify must not list, enumerate, sample, or read files in
  [`bad-patterns/`](bad-patterns/), spawn child agents, delegate review passes, or launch parallel
  repository hunts.
- Do not enter bad-pattern hunting mode merely because `/dust-flavify` was invoked.

The bad-pattern library is explicitly opt-in. Use it only when the user explicitly asks for the
`bad-patterns` library, a Flavify swarm, or a named bad-pattern hunt. A request to "flavify" alone
is never opt-in. When the user does opt in, select only the requested prompts unless they
explicitly ask for the full library, and give each hunt agent one focused prompt plus the target
scope. All GitHub and communication restrictions above still apply.

## Review workflow

### 1. Resolve the target

Use the first applicable target:

1. Explicit PR number or URL:
   - `gh pr view <number> --json title,body,author,files,additions,deletions,baseRefName,headRefName,url`
   - `gh pr diff <number>`
   - Read existing issue comments, review comments, and reviews for context.
2. Explicit commit: `git show --stat <sha>` and `git show <sha>`.
3. Provided diff or file paths: inspect them directly.
4. Current branch or pending changes:
   - `git status --porcelain`
   - `git diff` and `git diff --cached`
   - `git log <main>..HEAD --oneline`
   - `git diff <main>...HEAD`

If the target remains ambiguous, ask once and then default to the current branch.

### 2. Load the current canonical rules

Do not rely on rule-number ranges copied into this skill.

- Read the applicable `AGENTS.md` files.
- Read the repository-root `CODING_RULES.md`.
- Read each touched workspace's `CODING_RULES.md`.
- Treat those files as canonical even when they contain rules added after this skill was written.
- Cite their current rule identifiers in findings.

If the target touches migrations or database internals, prompts or LLM routing, SSE or streaming,
sandbox or E2B, MCP or agent tools, React or SWR, APIs, audit logging, observability, or CI/deploy
plumbing, read [`references/specialized-checks.md`](references/specialized-checks.md) completely
before reviewing that domain.

### 3. Understand the change before judging it

- Read the PR description, changed files, and existing review conversation.
- Read enough surrounding source to understand ownership, call paths, and invariants. Do not review
  isolated hunks when 30 surrounding lines can change the verdict.
- Identify migration ordering, feature-flag state, public/private API impact, and rollout context.
- Separate issues introduced by the target from pre-existing code. Mention pre-existing problems
  only when the change expands or relies on them.

### 4. Run the priority passes in order

#### Pass A: existing primitives and prior art

This is the highest-yield pass.

- Before accepting a new helper, constant, factory, mock, hook, adapter, wrapper, endpoint, or
  Resource method, search for an existing equivalent with `rg`.
- Search by behavior and imported dependencies, not only by the proposed symbol name.
- Reuse exported production constants in tests so tests follow production changes.
- Prefer shared factories and global mocks over local object construction or `Object.assign`
  approximations.
- Prefer an existing endpoint, mutator, Resource method, or utility over a parallel path.
- Factor duplicated logic when the same semantic operation appears more than once.
- If no reusable primitive exists, do not claim one does. Downgrade to `OOC` and ask.

Phrasing: "IIRC we have an existing helper.", "While you are at it, can we use the factory?",
"I shipped a global mock recently, you should be able to use it."

#### Pass B: ownership and concept boundaries

- Put lifecycle behavior on the Resource that owns the lifecycle.
- Put relationship creation and deletion on the owning Resource or a dedicated join/adapter
  Resource, not whichever Resource is convenient at the call site.
- When changing a flag, ACL field, status, or persisted identifier, state its old and new invariant.
  Trace every caller, absent or legacy state, and the transition or rollout. Do not overload an
  existing field when a new explicit concept or migration is clearer.
- Within one domain boundary, pass Resources or Types instead of raw model objects or ambiguous
  identifiers.
- Resources are the currency of server-side code. Serialize only at server boundaries, such as API
  responses and anything crossing to the client. Do not treat passing a Resource between server-side
  layers as a leak.
- Across concept boundaries, pass the smallest purpose-specific typed object when the callee only
  reads a few fields and has no use for the object's behavior. The concern is an unrelated concept
  taking a dependency on a full `ConversationResource`, `SandboxResource`, auth object, or provider
  object, not Resource use itself.
- Keep Sequelize models inside Resources and out of API/business-layer interfaces.
- Prefer class methods when a difficult return type or repeated call sequence is expressing object
  behavior.
- Avoid polymorphic ownership fields when explicit join tables or owner adapters produce clearer
  isolation and migration paths.
- Check that domain-specific concepts do not escape their folder or abstraction boundary.

Phrasing: "Why does this concept need to leak here?", "Could this be a small typed record?",
"Shouldn't the conversation resource own the link?"

#### Pass C: database access paths and batching

For every added or modified DB query:

- List the `where` predicates and identify the exact index expected to serve them.
- Check leading compound-index columns, selectivity, foreign-key indexes, and workspace scoping.
- Do not assume that merely having an index containing a column makes the query indexed.
- When a bounded indexed fetch already narrows the rows sufficiently, consider application-side
  filtering instead of adding an unindexed SQL predicate.
- Eliminate DB N+1 with a single batched query. `ConcurrentExecutor` limits concurrency but does
  not fix DB N+1 and is not the fallback for database queries.
- Treat N+1 as an access-pattern problem, not a SQL one. Per-item calls to Elasticsearch, Redis,
  object storage, internal services, third-party APIs, tools, or model providers are N+1 too when a
  batch endpoint exists. Where none exists, require an explicit bound on the fan-out.
- Do not use `Promise.all` to fan out dynamic DB work.
- Keep multi-statement mutations in a transaction, but never hold a transaction across an LLM or
  slow external call.
- Keep locks scoped to the critical section. A transaction-scoped advisory lock is held until
  commit; check its key cardinality and acquisition order.
- Repeat scoping predicates explicitly on every joined table that carries the column, including
  inside Sequelize `include` blocks. A predicate on one side does not constrain the other.
- Prefer one complete insert over insert-then-update or check-then-insert.
- Bound `TEXT`, array, and `JSONB` columns at the write path, and exclude large TOASTed fields when
  they are unnecessary.

Phrasing: "No index for this.", "IIRC the index needs `agentMessageId`?", "Can we avoid the
`Promise.all` here? It could fan out into many DB queries."

#### Pass D: simplicity, readability, and types

- Prefer the repository's established pattern and the simplest correct control flow.
- Reject non-type-safe `as Type` assertions; use type guards, schemas, or `satisfies`.
- Prefer discriminated unions over correlated optional fields and later conditional checks.
- Use exhaustive switches with the correct `assertNever` variant from current coding rules.
- Use framework/library types such as Sequelize `WhereOptions` rather than recreating loose shapes.
- Avoid negated boolean names. Prefer `canResume` and negate at the call site over
  `isNotResumable`.
- Avoid IIFEs, nested named functions, and dense ternaries when a module-level helper or
  straight-line code is clearer.
- Remove defensive copies that provide no immutability, ownership, or serialization value.
- Treat difficult tuple/object return types as a signal that behavior may belong on a class or
  Resource method.
- Never mutate function parameters.
- Use explicit public return types and unit suffixes for time, money, and ambiguous sizes.

Phrasing: "Not a big fan of negation in the name.", "I found this return type pretty tough.",
"Not sure I see why we need the copy here?"

#### Pass E: conventions, failures, and trust boundaries

- Run the mandatory resource-identifier pass below.
- Extract magic thresholds, TTLs, strings, and sizes. Reuse the production value in tests.
- Use one semantic unit for a comparison; do not mix bytes and characters without an explicit,
  justified conversion boundary.
- Return `Result<>` for expected boundary failures. Keep `try/catch` next to external libraries.
- Always normalize caught values with `normalizeError`.
- Use the application logger, never `console.*`.
- Await promises unless fire-and-forget is deliberate, documented, bounded, and catches failures.
- Audit spread/merge precedence for env vars, headers, claims, config maps, and metadata. Caller or
  owner data must not override reserved/internal keys accidentally.
- Minimize token and signed-claim data. Every scope-bearing identifier must have a concrete
  authorization need.
- Remove obsolete prompt text, feature-flag branches, fallbacks, endpoints, and parallel rollout
  paths when the cleanup stage is reached.
- Use test factories and Resources; do not expose or reload raw models merely for assertions.

### 5. Run relevant specialized passes

Apply only the relevant sections of the specialized reference. Migration safety, multi-tenancy,
public API compatibility, sandbox privilege boundaries, prompt-cache regressions, and unbounded
database work take precedence over stylistic findings.

### 6. Audit the PR description proportionally

For a non-trivial PR, require enough information to review and deploy safely:

- A concise problem and motivation.
- Root cause or mechanism for a bug fix.
- Quantified impact when performance, reliability, or cost is the reason for the change.
- Honest risk and rollback behavior.
- Ordered deploy/migration checkboxes when sequencing matters.
- Follow-up or predecessor signposting when the change belongs to a series.
- Relevant tests, UI screenshots, profiles, or operational evidence.

Do not require an external link merely for form. Ask for one only when authoritative context is
needed to understand a decision, incident, vendor behavior, or rollout.

Do not create standalone findings for optional presentation choices such as admonitions, emojis,
italic-bold design claims, ASCII diagrams, drive-by sections, or a multi-PR table when no series
exists. Suggest them only when they materially improve comprehension.

Do not complain about empty template sections on trivial fixes. Rewrite the description only when
missing context prevents review or hides operational risk.

### 7. Verify every finding

- Search for prior art before saying it exists.
- Trace subtle behavior through callers and tests.
- Quote the exact offending line when the issue is not obvious.
- Tie each `BLOCKER` to a current coding rule or a concrete correctness, security, migration, or
  operational failure.
- If evidence is incomplete, write an `OOC` question rather than asserting a defect.

### 8. Run the final `[BACK10]` pass

Detection is zero-tolerance; severity is contextual.

- String resource identifiers (`sId` values) are named `<resourceName>Id`.
- Numeric Sequelize/model identifiers are named `<resourceName>ModelId`.
- Never preserve or propose `xxxSId` or `xxxsId` names.
- Check changed identifiers, API payloads, Resource signatures, tests, PR examples, and every code
  suggestion in the review.
- Use `SHOULD` for a local naming violation.
- Use `BLOCKER` when a `ModelId` crosses an API/resource boundary, a public interface is ambiguous,
  or the naming hides a multi-tenant/security error.

## Severity and verdicts

- `BLOCKER`: merge-unsafe correctness, security, multi-tenancy, public API, migration, prompt-cache,
  unbounded DB, or privilege-boundary issue; or a material violation of a current canonical rule.
- `SHOULD`: strong, merge-safe request that should be addressed or explicitly justified.
- `nit`: small readability, naming, or consistency improvement.
- `OOC`: question whose answer may change the verdict; do not imply a required change.
- `PRAISE`: only genuinely useful or unusually clean work. Never praise the existence of the PR.

Choose:

- `REQUEST_CHANGES` when at least one `BLOCKER` remains.
- `APPROVE_WITH_NITS` when no blocker remains but there are actionable `SHOULD` or `nit` findings.
- `APPROVE` when there is no actionable feedback.

This review style commonly approves while leaving focused questions or nits. Do not inflate those into a
blocking verdict.

## Output format

Produce the report inline:

```markdown
# Flavify Review — <target>

**Verdict:** APPROVE | APPROVE_WITH_NITS | REQUEST_CHANGES

**Summary:** <actual change and the one or two most important observations>

## Blockers
- **`BLOCKER`** [`file:line`] <terse finding, evidence, current rule, concrete direction>

## Shoulds
- **`SHOULD`** [`file:line`] ...

## Nits
- **`nit`** [`file:line`] ...

## Open questions
- **`OOC`** [`file:line`] ...

## Praise
- **`PRAISE`** [`file`] ...

## PR description audit
- <only material checks for this PR>

## Final note
<one terse sentence>
```

Omit empty finding sections. Keep each finding to one to three sentences. Include a surgical
`suggestion` block only when it is clearly correct and `[BACK10]`-compliant.

## Voice

- Open directly with the problem; no ceremonial introduction or trailing recap.
- Use `nit`, `OOC`, `IIRC`, `IMHO`, `WDYT?`, and `FWIW` naturally, not performatively.
- Prefer questions when ownership or intent is uncertain.
- Quantify performance and operational concerns.
- Use emojis sparingly. They are tone, never evidence.
- Say "fine" or `LGTM` when something is fine.
- Use terse resolutions: "Fixed.", "Removed.", "Sure.", "Yep."

## Quick reference

Scan in this order:

1. Is this reimplementing an existing helper, constant, factory, mock, hook, endpoint, or Resource
   method?
2. Does the correct Resource/module own the relationship and lifecycle?
3. Is a full Resource or domain concept leaking across a boundary where a small typed input works?
4. Can every DB predicate use the intended index, and is DB work batched rather than concurrency
   limited?
5. Is the code simpler without an IIFE, nested function, negated boolean, needless copy, or
   difficult return shape?
6. Any `[BACK10]` identifier violation?
7. Any unsafe assertion, missing discriminated union, wrong exhaustive-switch variant, or missed
   library type?
8. Any magic value, duplicated constant, mixed unit, or test value that should follow production?
9. Any missed `Result<>`, misplaced `try/catch`, or unnormalized caught value?
10. Can external/owner data override reserved keys? Does a token contain unnecessary scope data?
11. Any unawaited work, dynamic fan-out, race, or unbounded promise?
12. Any obsolete rollout branch, fallback, prompt, endpoint, or feature flag?
13. Do migration, prompt-cache, SSE, sandbox, MCP, or observability specialized checks apply?
14. Are API compatibility, Swagger, audit logs, and frontend loading/state rules current?
15. Does the PR description explain risk and ordering well enough to merge safely?

When the scan is clean, complete the full relevant review and approve. Never invent a nit to avoid
an empty report.
