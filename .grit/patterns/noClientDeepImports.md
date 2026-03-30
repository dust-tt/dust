---
tags: [lint, imports]
level: error
---

# No deep imports from @dust-tt/client

Forbids deep imports from `@dust-tt/client/*` subpaths in `front/` code.
Only the package root `@dust-tt/client` should be imported.

```grit
language js

client_deep_import() => `"CLIENT_DEEP_IMPORT_FORBIDDEN"`
```

## Should flag import from client/src

```typescript
// @filename: app/front/lib/utils.ts
import { Foo } from "@dust-tt/client/src";
```

```typescript
// @filename: app/front/lib/utils.ts
import { Foo } from "CLIENT_DEEP_IMPORT_FORBIDDEN";
```

## Should flag import from client/src/toto.ts

```typescript
// @filename: app/front/lib/utils.ts
import { Bar } from "@dust-tt/client/src/toto";
```

```typescript
// @filename: app/front/lib/utils.ts
import { Bar } from "CLIENT_DEEP_IMPORT_FORBIDDEN";
```

## Should not flag import from client root

```typescript
// @filename: app/front/lib/utils.ts
import { Foo } from "@dust-tt/client";
```

## Should not flag deep import outside front

```typescript
// @filename: app/connectors/lib/utils.ts
import { Foo } from "@dust-tt/client/src";
```
