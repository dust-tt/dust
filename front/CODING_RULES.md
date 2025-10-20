# [front] Coding Rules

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

### [GEN6] Comments must be sentences and properly wrapped

Comments must be full sentences (generally starting with a capital letter and ending with a period)
and must be consistently wrapped (see examples below).

Example:

```
// BAD
// new function
// does something
// interesting

// BAD
// this is a comment that is neither a full sentence nor wrapped at 100 characters (clearly higher) / it should be wrapped because otherwise it's really hard to read

// BAD
// This comment is a valid sentence but it
// is wrapped at a much lower character count than
// 100. It should be wrapped at ~100 characters.

// BAD
// Check if the current tag is the page selector.
// If it is, we are inside a page.
// This assumes that we don't have nested pages.

// GOOD
// This function is new and does something interesting.
// TODO(xxx): improve the efficiency of this.

// GOOD
// This is a comment that is a full sentence and is wrapped at 100 characters. It is easy to read
// and supports consistency of our code style.

// GOOD
// Permissions:
// - "never_ask": Automatically approved
// - "low": Ask user for approval and allow to automatically approve next time
// - "high": Ask for approval each time
// - undefined: Use default permission ("never_ask" for default tools, "high" for other tools)

// GOOD
// Check if the current tag is the page selector. If it is, we are inside a page. This assumes that
// we don't have nested pages.
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

Direct calls to `console.log`, `console.error`, `console.warn`, `console.info`, or similar console methods are prohibited in the codebase. Always use the application logger for all logging, debugging, and error reporting purposes. This ensures consistent log formatting, proper log routing, and easier log management across environments.

Example:

```
// BAD
console.log("User created", user);
console.error("Failed to fetch data", error);

// GOOD
logger.info({ user }, "User created");
logger.error({ err: error }, "Failed to fetch data");
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

## BACKEND

### [BACK1] No sequelize models in API routes

API routes should not interact with sequelize models directly. Use `lib/api/*` interfaces (creating
them if missing). Direct Resource interaction are acceptable.

### [BACK2] No sequelize models or ModelId in `lib/api/*` interfaces

Interfaces in `lib/api/*` should not expose ModelId or sequelize model objects.

Example:

```
// BAD

function doWorkspace({ id }: { id: ModelId }) { }

// GOOD

function doWorkspace({ workspace }: { workspace: WorkspaceType }) { }
```

### [BACK3] Resource invariant: no sequelize models outside of resources

Any new model should be abstracted to the rest of the codebase through a pre-existing or new
`Resource`.

### [BACK4] Resource invariant: no models in interfaces

Resources interface should take Resource or Types but not model objects.

### [BACK5] Resource invariant: `lib/api/*` should use Resources not models

Any newly introduced function in `lib/api/*` should rely on Resources and not models directly.

### [BACK6] Use ConcurrentExecutor vs PQueue

We are deprecating our use of `PQueue` in favor of `ConcurrentExecutor`. Use `ConcurrentExecutor`
for all new code and migrate to it from `PQueue` when modifying existing code that involves
`PQueue`.

### [BACK7] Avoid `Promise.all` on dynamic arrays

Never use `Promise.all` on anything else than static arrays of promises with a known length (8 max).
To parallelize asynchronous handling of dynamic arrays, use `ConcurrentExecutor`.

### [BACK8] Favor typeguards over other methods

When checking types, use explicit typeguards over `typeof`, `instanceof`, etc.

### [BACK9] Standardized query parameters extraction

Use `{ foo } = req.query` and then test with `isString` to extract query parameters in endpoints.

Example:

```
// BAD

if (typeof req.query.aId !== "string") {
  // error
}

const r = someFunction(req.query.aId);
const r = someFunction(req.query.aId as string);

// GOOD

const { aId } = req.query;

if (isString(aId)) {
  // error
}

const r = someFunction(aId);
```

### [BACK10] Resource invariant: Resources must expose both `sId` and `id`

Resources and associated types should consistently expose both `sId` (string) and `id` (ModelId) in
their interfaces. This pattern ensures consistency across the codebase and proper type safety.

Example:

```
// BAD
interface ResourceType {
id: string;
}

// GOOD
interface ResourceType {
sId: string;
id: ModelId;
}
```

### [BACK11] Resource invariant: Use "Model" suffix for Sequelize models when creating Resources

When creating a new Resource that wraps a Sequelize model, the model should be renamed to include
the "Model" suffix for clarity (e.g., `Conversation` becomes `ConversationModel`).
This naming convention helps distinguish between the Resource interface and
the underlying Sequelize model implementation.

Example:

```
// BAD
class Conversation extends Model { }

// GOOD
class ConversationModel extends Model { }
```

## MCP

### [MCP1] Single file internal servers

If possible, internal MCP servers should fit in one file. The name of the file must match the
name of the server. If having only one file is not possible, they should be placed into a folder
that contains a file `index.ts` from where the `createServer` function that creates the server
will be default exported.

### [MCP2] Tool output typing

If a tool in an internal MCP server outputs a custom resource, a `zod` schema that describes the
output must be defined in `lib/actions/mcp_internal_actions/output_schemas.ts`. This way, when
processing the tool output, a typeguard that checks the output against the schema
can be used to identify this output type. In the code of the internal server the type inferred
from the `zod` schema should be used to type the tool output.

## TESTING

### [TEST1] Functionally test endpoints

When introducing new endpoints or modifying existing endpoints, introduce functional tests. Our
tests are functional and focus at the endpoint level for now. Unit tests are not required nor
desired.

### [TEST2] Test setup through factories

Test state setup should be done through factories. Factories should return Resources whenever
possible.

### [TEST5] Avoid sequelize models in tests

Direct use of sequelize models in tests should be avoided in favor of Resources. This includes test
setup and assertions.

## REACT

### [REACT1] Always create `interface` for components Props

Components props should always be typed using an `interface`.

Example:

```
// BAD

export function Component({ name }: { name: string }) { }

// GOOD

interface MyComponentProps {
  name: string;
}

export function Component({ name }: MyComponentProps) { }
```

### [REACT2] All network operations should be abstracted in SWR files

Data fetching should rely on useSWR hooks and be abstracted in a `lib/swr/*` file.

When using a disabled param and returning a loading flag, ensure `loading` is `false` if `disabled`
is `true`.

When a hook is expected to return an array of objects, return an empty array (from `emptyArray()`)
while loading/error/disabled instead of `undefined`.

Example:

```
export function useFolders({ owner, spaceId } : { owner: LightWorkspaceType, spaceId: string }) {
  // ...
  const { data, error, mutate } = useSWRWithDefaults(...);
  // ...
  return {
    folders: data?.folders ?? emptyArray(),
    mutate,
    isFoldersLoading: !error && !data && !disabled,
    isFoldersError: error
  };
}
```

Data posting should be done in hooks colocated with the SWR hooks. Do not fetch directly in
components. Success and failure notifications should be sent from the hook.

```
export function useCreateFolder({
  owner,
  spaceId,
} : {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();
  // ...
  return doCreate = async (name: string) => {
    // ...
  };
};
```

### [REACT3] Any async network operation should have a visual loading state

Any load/async has a visible visual state (spinner, busy state, disabled button, etc), even if the
load time is expected to be small.
