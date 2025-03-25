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

### [GEN6] Comments must be sentences wrapped at 100 characters

Comments must be full sentences (starting with a capital letter and ending with a period) and must
be wrapped at 100 characters. Wrapping at a lower characer count should be avoided.

Example:

```
// BAD
// this is a comment that is neither a full sentence nor wrapped at 100 characers / it should be wrapped because otherwise it's really hard to read

// BAD
// This comment is a valid sentence but it
// is wrapped at a lower character count than
// 100. It should be wrapped at 100 characters.

// GOOD
// This is a comment that is a full sentence and is wrapped at 100 characters. It is easy to read
// and supports consistency of our code style.
```

## SECURITY

### [SEC1] No sensitive data outside of HTTP bodies or headers

No sensitive data should be sent to our servers through URL or query string parameters. HTTP body or
headers only are acceptable for sensitive data.

## ERROR

### [ERR1] Do not rely on throw + catch

Never catch your own errors. `catch` is authorized around external libraries (whose error handling
we don't control), but otherwise errors that may alter the execution upstream should be returned
using our `Result<>` pattern. It is OK to throw errors, since we can't catch them these are
guaranteed to trigger a internal error (and return a 500).

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
To parallelize asyncrhonous handling of dynamic arrays, use `ConcurrentExecutor`.

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

Data fetching should rely on useSWR hooks and be abstracted in a `lib/swr/*` file. Data posting
should be done in hooks colocated with the SWR hooks. Do not fetch direclty in componenets.

Example:

```
export function useFolders({ owner, spaceId } : { owner: LightWorkspaceType, spaceId: string }) {
  // ...
  const { data, error, mutate } = useSWRWithDefaults(...);
  // ...
  return { folders, mutate, isFoldersLoading, isFoldersError };
}

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
