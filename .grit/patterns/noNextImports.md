---
tags: [lint, imports]
level: error
---

# No direct next imports

Prevents direct imports from `next` or `next/*` packages.
Enforces platform abstraction layer for code sharing between NextJS and Vite SPA.

```grit
language js

no_next_import() => `NEXT_IMPORT_FORBIDDEN`
```

## Should flag import from next

```typescript
import Head from "next/head";
```

```typescript
NEXT_IMPORT_FORBIDDEN
```

## Should flag named import from next/navigation

```typescript
import { useRouter } from "next/navigation";
```

```typescript
NEXT_IMPORT_FORBIDDEN
```

## Should flag type import from next/server

```typescript
import type { NextRequest } from "next/server";
```

```typescript
NEXT_IMPORT_FORBIDDEN
```

## Should not flag non-next imports

```typescript
import React from "react";
```
