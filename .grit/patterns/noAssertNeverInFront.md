---
tags: [lint, safety]
level: error
---

# No assertNever in frontend components

Frontend components must use `assertNeverAndIgnore` instead of `assertNever`.
The server may introduce new enum values before the client is redeployed;
`assertNever` would throw and crash the app.

```grit
language js

assert_never_import() => `ASSERT_NEVER_FORBIDDEN_USE_ASSERT_NEVER_AND_IGNORE`
```

## Should flag assertNever import

```typescript
import { assertNever } from "@app/types/shared/utils/assert_never";
```

```typescript
ASSERT_NEVER_FORBIDDEN_USE_ASSERT_NEVER_AND_IGNORE
```

## Should not flag assertNeverAndIgnore import

```typescript
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
```

## Should not flag both imports together

```typescript
import { assertNever, assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
```
