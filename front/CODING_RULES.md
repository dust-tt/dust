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

### [BACK1] No models in API routes

API routes should not interact with models directly. Use `lib/api/*` interfaces (creating them if
missing). Direct Resource interaction are acceptable.

### [BACK2] No models or ModelId in `lib/api/*` interfaces

Interfaces in `lib/api/*` should not expose ModelId or Sequelize Model objects.

### [BACK3] Resource invariant: no models outside of resources

Any new model should be abstracted to the rest of the codebase through a pre-existing or new
`Resource`.

### [BACK4] Resource invariant: no models in interfaces

Resources interface should take Resource or Types but not model objects.

### [BACK5] Resource invariant: `lib/api/*` should use Resources not models

Any newly introduced function in `lib/api/*` should rely on Resources and not models directly.

### [BACK6] Functionally test endpoints

When introducing new endpoints or modifying existing endpoints, introduce functional tests. Our
tests are functional and focus at the endpoint level for now. Unit tests are not required nor
desired.

### [BACK7] Use ConcurrentExecutor vs PQueue

We are deprecating our use of `PQueue` in favor of `ConcurrentExecutor`. Use `ConcurrentExecutor`
for all new code and migrate to it from `PQueue` when modifying existing code that involves
`PQueue`.

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

### [REACT2] Standardized query parameters extraction

Use `{ foo } = req.query` and then test with `typeof` to extract query parameters in endpoints.

Example:

```
// BAD

if(typeof req.query.aid !== "string") {
  // error
}

const r = someFunction(req.query.aid);
const r = someFunction(req.query.aid as string);

// GOOD

const { aid } = req.query;

if (typeof aid !== "string") {
  // error
}

const r = someFunction(aid);
```
