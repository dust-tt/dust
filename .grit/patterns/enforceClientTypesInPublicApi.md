---
tags: [lint, imports]
level: error
---

# Enforce client types in public API

Enforces that `@dust-tt/client` imports are only used in specific directories.

Note: The original Biome plugin uses `$filename` filtering which cannot be tested
in grit. This test validates the core matching logic only.

```grit
language js

`"@dust-tt/client"` => `"CLIENT_IMPORT_FLAGGED"`
```

## Should match client import

```typescript
import { SomeType } from "@dust-tt/client";
```

```typescript
import { SomeType } from "CLIENT_IMPORT_FLAGGED";
```

## Should not match other imports

```typescript
import { SomeType } from "@dust-tt/types";
```
