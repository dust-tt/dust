---
tags: [ lint, imports ]
level: error
---

# Enforce client types in public API

Enforces that `@dust-tt/client` imports are only used in specific directories.

```grit
language js

client_import_source() => `"CLIENT_IMPORT_FLAGGED"`
```

## Should flag client import in front lib

```typescript
// @filename: app/front/lib/utils.ts
import {SomeType} from "@dust-tt/client";
```

```typescript
// @filename: app/front/lib/utils.ts
import {SomeType} from "CLIENT_IMPORT_FLAGGED";
```

## Should not flag client import in api v1

```typescript
// @filename: app/front/pages/api/v1/endpoint.ts
import {SomeType} from "@dust-tt/client";
```

## Should not flag client import in mcp internal actions

```typescript
// @filename: app/front/lib/actions/mcp_internal_actions/tool.ts
import {SomeType} from "@dust-tt/client";
```

## Should not flag client import in test files

```typescript
// @filename: app/front/lib/utils.test.ts
import {SomeType} from "@dust-tt/client";
```

## Should not flag other imports

```typescript
// @filename: app/front/lib/utils.ts
import {SomeType} from "@dust-tt/types";
```
