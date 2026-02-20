---
tags: [lint, imports]
level: error
---

# No bulk lodash imports

Disallows bulk lodash imports (e.g., `import { debounce } from 'lodash'`).
Requires individual imports (e.g., `import debounce from 'lodash/debounce'`).

```grit
language js

`"lodash"` => `"BULK_LODASH_IMPORT_FORBIDDEN"`
```

## Should flag bulk lodash import

```typescript
import { debounce } from "lodash";
```

```typescript
import { debounce } from "BULK_LODASH_IMPORT_FORBIDDEN";
```

## Should flag named bulk lodash import

```typescript
import _ from "lodash";
```

```typescript
import _ from "BULK_LODASH_IMPORT_FORBIDDEN";
```

## Should not flag individual lodash import

```typescript
import debounce from "lodash/debounce";
```
