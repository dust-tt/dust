---
tags: [lint, imports]
level: error
---

# No direct sparkle notification import

Discourages direct import of `useSendNotification` from `@dust-tt/sparkle`.
Use `@app/hooks/useNotification` instead.

```grit
language js

`import { useSendNotification } from "@dust-tt/sparkle"` => `DIRECT_SPARKLE_NOTIFICATION_FORBIDDEN`
```

## Should flag direct sparkle notification import

```typescript
import { useSendNotification } from "@dust-tt/sparkle";
```

```typescript
DIRECT_SPARKLE_NOTIFICATION_FORBIDDEN
```

## Should not flag app hooks import

```typescript
import { useSendNotification } from "@app/hooks/useNotification";
```

## Should not flag other sparkle imports

```typescript
import { Button } from "@dust-tt/sparkle";
```
