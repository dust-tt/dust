# Shared Coding Rules

These rules apply to all code across the monorepo. Workspace-specific rules are in each
workspace's own `CODING_RULES.md`.

## GENERAL

### [GEN1] Consistently bad is better than inconsistently good

Favor re-using existing patterns (with broad refactors if necessary) over introducing new ones
sporadically.

Reviewer: If you detect a pattern that is not consistent with an existing approach in the codebase,
require the author to match the existing pattern (and possibly refactor everything in a subsequent
PR).

### [GEN2] Simple but good is better than perfect but complex

Favor simple and easy to understand approaches vs overly optimized but complex ones.

Reviewer: If you detect an overly optimized or complex solution that can be simplified (at the cost
of a bit of performance loss or extra code), ask the author to consider the simpler approach.

### [GEN3] Favor types over typescript enums

We do not use typescript enums, we use types instead, eg: `type Color = "red" | "blue";`.

### [GEN4] Non type-safe use of `as` is prohibited

The non type-safe uses of `as` are prohibited in the codebase. Use typeguards or other type-safe
methods instead. There are few exceptions where `as` is type-safe to use (eg, `as const`) and
therefore acceptable.

### [GEN5] No mutation of function parameters

Never mutate arrays or objects passed as parameters to functions. Create and return new instances
instead. This includes avoiding methods like `splice` that mutate arrays in place.

Reviewer: If you detect parameter mutation in the code (including array methods like `splice`),
request the author to refactor the code to create and return new instances instead.

Example:

```
// BAD
function addItem(items: string[], newItem: string) {
  items.push(newItem);
  return items;
}

// GOOD
function addItem(items: string[], newItem: string) {
  return [...items, newItem];
}
```

### [GEN6] Prefer exhaustive switch + assertNever over if/else on union types

When branching on a discriminated union or string union, prefer an exhaustive `switch` with
`assertNever` (from `@app/types/shared/utils/assert_never`) over chains of `if`/`else` or nested
ternaries. This keeps the code readable and ensures TypeScript enforces exhaustiveness when cases
are added.

Two variants are available:

- **`assertNever`**: Throws at runtime. Use when missing a case is a bug (server-side code,
  internal client logic, client-created data).
- **`assertNeverAndIgnore`**: Does NOT throw at runtime. Use in client-side code that processes
  API data (event streams, API responses, connector types, etc.) where the server may add new
  enum values before the client is updated. The unknown value is silently ignored instead of
  crashing the app.

Both provide the same compile-time exhaustiveness checking. Using the wrong variant is a bug:
using `assertNever` on API data can crash the app when the server adds a new value, and using
`assertNeverAndIgnore` on internal logic can silently swallow programming errors.

Example:

```
import { assertNever, assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

// Internal logic: use assertNever (crash on missing case)
type Status = "approved" | "rejected" | "expired";

function titleForStatus(status: Status): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    default:
      return assertNever(status);
  }
}

// Processing API data: use assertNeverAndIgnore (gracefully ignore unknown values)
function handleStreamEvent(event: AgentMessageEvent): State {
  switch (event.type) {
    case "generation_tokens":
      return { ...state, content: state.content + event.text };
    case "agent_error":
      return { ...state, status: "error" };
    default:
      assertNeverAndIgnore(event);
      return state;
  }
}
```

### [GEN7] Avoid loops with quadratic or worse complexity

Loops with quadratic O(n²) or worse cubic O(n³) complexity can severely hurt performance as data
sizes grow. Common quadratic patterns include nested loops over related datasets, repeated searches
within loops, and chained array operations that each iterate over the data.

Always prefer linear O(n) or logarithmic O(n log n) solutions using data structures like Map, Set,
or sorted arrays. When quadratic complexity is unavoidable, ensure array sizes are small (< 100
elements) and comment the code appropriately with expected array sizes and execution time. For
larger datasets or longer operations, implement async processing or move to separate workflows.

Example:

```
// BAD - O(n²) nested loop
function findDuplicates(items: Item[], otherItems: Item[]) {
  const duplicates = [];
  for (const item of items) {
    for (const other of otherItems) {
      if (item.id === other.id) {
        duplicates.push(item);
      }
    }
  }
  return duplicates;
}

// GOOD - O(n) using Set lookup
function findDuplicates(items: Item[], otherItems: Item[]) {
  const otherIds = new Set(otherItems.map(item => item.id));
  return items.filter(item => otherIds.has(item.id));
}

// BAD - O(n²) repeated find operation in map
const enrichedAgents = agents.map(agent => ({
  ...agent,
  isFavorite: members.find(m => m.favoriteAgentId === agent.sId) !== undefined
}));

// GOOD - O(n) using Set for constant-time lookup
const favoriteAgentIds = new Set(members.map(m => m.favoriteAgentId));
const enrichedAgents = agents.map(agent => ({
  ...agent,
  isFavorite: favoriteAgentIds.has(agent.sId)
}));

// BAD - O(n²) nested loops without bounds checking
for (const workspace of workspaces) {
  for (const member of workspace.members) {
    processWorkspaceMember(workspace, member);
  }
}

// GOOD - Comment when quadratic is acceptable due to small array sizes
function validatePermissions(userRoles: string[], requiredPermissions: string[]) {
  // O(n²) acceptable: both arrays guaranteed to be small (< 20 elements each).
  return requiredPermissions.every(permission =>
    userRoles.some(role => hasPermission(role, permission))
  );
}
```

When quadratic complexity cannot be avoided:

- Comment the expected maximum array sizes and execution time
- Add runtime assertions if sizes could exceed safe limits
- Consider moving to background processing for larger datasets
- Implement proper async handling with progress indicators for long operations

### [GEN8] Do not use console.log, console.error, etc. — always use the app logger

Direct calls to `console.log`, `console.error`, `console.warn`, `console.info`, or similar console
methods are prohibited in the codebase. Always use the application logger for all logging,
debugging, and error reporting purposes. This ensures consistent log formatting, proper log
routing, and easier log management across environments.

Example:

```
// BAD
console.log("User created", user);
console.error("Failed to fetch data", error);

// GOOD
logger.info({ user }, "User created");
logger.error({ err: error }, "Failed to fetch data");
```

### [GEN9] Use unit suffixes for money and time variables

Variables representing monetary amounts or time durations must include a unit suffix in their name.
This prevents conversion errors (e.g., cents vs dollars, milliseconds vs seconds) such as the one
that caused [this incident](https://dust4ai.slack.com/archives/C05B529FHV1/p1764835038528229).

Common suffixes:

- Money: `Cents`, `Dollars` (e.g., `priceCents`, `amountDollars`)
- Time: `Ms`, `Seconds`, `Minutes`, `Hours` (e.g., `timeoutMs`, `durationSeconds`)

Reviewer: If you detect a variable representing money or time without a unit suffix, require the
author to rename it with the appropriate suffix.

Example:

```
// BAD
const price = 1999;
const timeout = 5000;
const delay = 30;

// GOOD
const priceCents = 1999;
const timeoutMs = 5000;
const delaySeconds = 30;
```

## SECURITY

### [SEC1] No sensitive data outside of HTTP bodies or headers

No sensitive data should be sent to our servers through URL or query string parameters. HTTP body or
headers only are acceptable for sensitive data.

### [SEC2] No ModelId exposure in URLs or API endpoints

Never expose or accept ModelId in URLs, API endpoints or POST/PATCH payloads. Use string identifiers
(sId) instead. This applies to all routes, including GET, POST, PATCH, and DELETE methods. ModelIds
should be strictly internal and never exposed to the client.

Example:

```
// BAD
/api/w/[wId]/resource/[modelId]

// GOOD
/api/w/[wId]/resource/[sId]
```

## ERROR

### [ERR1] Do not rely on throw + catch

Never catch your own errors. `catch` is authorized around external libraries (whose error handling
we don't control), but otherwise errors that may alter the execution upstream should be returned
using our `Result<>` pattern. It is OK to throw errors, since we can't catch them these are
guaranteed to trigger a internal error (and return a 500).

### [ERR2] Do not rely on `err as Error`

Never catch and cast what was caught as `Error`. JS allows throwing anything (string, number,
random object, ...) so the cast may be invalid and hides errors from the logs. Use `normalizeError`
instead, this function properly checks the content of the caught object and always returns a valid
`Error` object.

Example:

```
// BAD
try {
  // Some code.
} catch (err) {
  return new Err(err as Err);
}

// GOOD
try {
  // Some code.
} catch(err) {
  return new Err(normalizeError(err));
}
```
