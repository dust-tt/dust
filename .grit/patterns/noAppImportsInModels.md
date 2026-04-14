---
tags: [lint, imports]
level: error
---

# No @app imports in front/lib/api/models

Prevents files in `front/lib/api/models/` from importing anything from `@app/*`,
except from `@app/lib/api/models/*` itself. This ensures the models directory stays
self-contained with no coupling to the rest of the app.

```grit
language js

app_import_source() as $import where {
    $filename <: r".*/front/lib/api/models/.*"
} => `APP_IMPORT_IN_MODELS_FORBIDDEN`
```

## Should flag @app import outside models

```typescript
// @filename: app/front/lib/api/models/clients/anthropic/foo.ts
import { assertNever } from "@app/types/shared/utils/assert_never";
```

```typescript
// @filename: app/front/lib/api/models/clients/anthropic/foo.ts
APP_IMPORT_IN_MODELS_FORBIDDEN
```

## Should flag type import from @app outside models

```typescript
// @filename: app/front/lib/api/models/clients/anthropic/foo.ts
import type { Workspace } from "@app/lib/models/workspace";
```

```typescript
// @filename: app/front/lib/api/models/clients/anthropic/foo.ts
APP_IMPORT_IN_MODELS_FORBIDDEN
```

## Should not flag @app/lib/api/models imports

```typescript
// @filename: app/front/lib/api/models/clients/anthropic/foo.ts
import type { LargeLanguageModel } from "@app/lib/api/models/index";
```

## Should not flag non-@app imports

```typescript
// @filename: app/front/lib/api/models/clients/anthropic/foo.ts
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
```

## Should not flag @app imports outside models directory

```typescript
// @filename: app/front/lib/utils.ts
import { assertNever } from "@app/types/shared/utils/assert_never";
```
