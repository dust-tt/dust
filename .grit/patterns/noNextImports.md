---
tags: [lint, imports]
level: error
---

# No direct next imports

Prevents direct imports from `next` or `next/*` packages.
Enforces platform abstraction layer for code sharing between NextJS and Vite SPA.

```grit
language js

or {
    `import $_ from $source`,
    `import { $_ } from $source`,
    `import type $_ from $source`,
    `import type { $_ } from $source`,
    `import * as $_ from $source`,
} where {
    $source <: or {
        `"next"`,
        `"next/app"`,
        `"next/document"`,
        `"next/dynamic"`,
        `"next/font/google"`,
        `"next/font/local"`,
        `"next/head"`,
        `"next/image"`,
        `"next/link"`,
        `"next/navigation"`,
        `"next/router"`,
        `"next/script"`,
        `"next/server"`
    },
    $source => `"NEXT_IMPORT_FORBIDDEN"`
}
```

## Should flag import from next

```typescript
import Head from "next/head";
```

```typescript
import Head from "NEXT_IMPORT_FORBIDDEN";
```

## Should flag named import from next/navigation

```typescript
import { useRouter } from "next/navigation";
```

```typescript
import { useRouter } from "NEXT_IMPORT_FORBIDDEN";
```

## Should flag type import from next/server

```typescript
import type { NextRequest } from "next/server";
```

```typescript
import type { NextRequest } from "NEXT_IMPORT_FORBIDDEN";
```

## Should not flag non-next imports

```typescript
import React from "react";
```
