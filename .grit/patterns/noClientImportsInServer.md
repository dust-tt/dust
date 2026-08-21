---
tags: [lint, imports]
level: error
---

# No client-only imports in server code

Server-side code must not value-import client-only modules. Every such import
pulls that module's whole dependency graph into the front-api bundle, which is
loaded in full before the server binds its socket.

Type-only imports are erased at build time and stay allowed.

Known limitation: Biome GritQL may not flag named imports with several
specifiers (biome#5801).

```grit
language js

no_client_import_in_server() => `FORBIDDEN_CLIENT_IMPORT`
```

## Should flag a value import from components

```typescript
// @filename: app/front/lib/api/foo.ts
import { someHelper } from "@app/components/agent_builder/types";
```

```typescript
// @filename: app/front/lib/api/foo.ts
FORBIDDEN_CLIENT_IMPORT
```

## Should flag a value import from Sparkle

```typescript
// @filename: app/front/lib/api/foo.ts
import { Button } from "@dust-tt/sparkle";
```

```typescript
// @filename: app/front/lib/api/foo.ts
FORBIDDEN_CLIENT_IMPORT
```

## Should allow `import type` because it is erased at runtime

```typescript
// @filename: app/front/lib/api/foo.ts
import type { SomeType } from "@app/components/agent_builder/types";
```
