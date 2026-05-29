---
tags: [lint, imports]
level: error
---

# No @app imports in front/lib/model_constructors

Prevents files in `front/lib/model_constructors/` from importing anything from `@app/*`,
except from `@app/lib/model_constructors/*` itself. This ensures the model_constructors directory stays
self-contained with no coupling to the rest of the app.

```grit
language js

app_import_source() as $import where {
    $filename <: r".*/front/lib/model_constructors/.*"
} => `APP_IMPORT_IN_MODELS_FORBIDDEN`
```

## Should flag @app import outside models

```typescript
// @filename: app/front/lib/model_constructors/clients/anthropic/foo.ts
import { assertNever } from "@app/types/shared/utils/assert_never";
```

```typescript
// @filename: app/front/lib/model_constructors/clients/anthropic/foo.ts
APP_IMPORT_IN_MODELS_FORBIDDEN
```

## Should flag type import from @app outside models

```typescript
// @filename: app/front/lib/model_constructors/clients/anthropic/foo.ts
import type { Workspace } from "@app/lib/models/workspace";
```

```typescript
// @filename: app/front/lib/model_constructors/clients/anthropic/foo.ts
APP_IMPORT_IN_MODELS_FORBIDDEN
```

## Should not flag @app/lib/model_constructors imports

```typescript
// @filename: app/front/lib/model_constructors/clients/anthropic/foo.ts
import type { LargeLanguageModel } from "@app/lib/model_constructors/index";
```

## Should not flag non-@app imports

```typescript
// @filename: app/front/lib/model_constructors/clients/anthropic/foo.ts
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
```

## Should not flag @app imports outside models directory

```typescript
// @filename: app/front/lib/utils.ts
import { assertNever } from "@app/types/shared/utils/assert_never";
```
