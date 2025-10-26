# eslint-plugin-dust

Custom ESLint rules for the Dust codebase.

## Installation

This plugin is used internally in the Dust monorepo and is configured in the front package's `.eslintrc.js`.

## Rules

### `no-raw-sql`

Prevents direct use of raw SQL queries to encourage use of ORM methods.

### `no-unverified-workspace-bypass`

Ensures workspace verification is not bypassed in security-critical code paths.

### `too-long-index-name`

Warns when database index names exceed length limits.

### `no-direct-sparkle-notification`

Discourages direct use of Sparkle notification components in certain contexts.

### `no-bulk-lodash`

Prevents importing the entire lodash library to reduce bundle size.

### `enforce-client-types-in-public-api`

Enforces correct usage of `@dust-tt/client` types in public API endpoints. Files in `/api/v1/` must:
- Import types from `@dust-tt/client`
- Use these types in handler response signatures
- Not allow these imports outside v1 API routes

### `require-schema-validation`

**Enforces Zod schema validation with `.strip().parse()` on public API responses to prevent data leakage.**

This rule ensures that all responses from public API endpoints (files in `/pages/api/v1/`) are validated using Zod schemas with `.strip().parse()` to prevent accidentally leaking internal/private data fields through public APIs.

#### Why This Rule Exists

When building public APIs, it's common to fetch data from internal APIs or databases that contain more fields than should be exposed publicly. Without proper validation and stripping, sensitive internal fields can accidentally leak to public consumers.

#### Valid Patterns

✅ **Standard validation with strip:**
```typescript
import { PublicUserSchema } from './schemas';

export default async function handler(req, res) {
  const internalUser = await fetchInternalUser();
  const sanitized = PublicUserSchema.strip().parse(internalUser);
  return res.json(sanitized);
}
```

✅ **Inline validation:**
```typescript
export default async function handler(req, res) {
  const internalUser = await fetchInternalUser();
  return res.json(PublicUserSchema.strip().parse(internalUser));
}
```

✅ **Safe parse with error handling:**
```typescript
export default async function handler(req, res) {
  const internalUser = await fetchInternalUser();
  const result = PublicUserSchema.strip().safeParse(internalUser);

  if (!result.success) {
    return res.status(400).json({ error: "Invalid data" });
  }

  return res.json(result.data);
}
```

✅ **Objects with validated properties:**
```typescript
export default async function handler(req, res) {
  const internalUser = await fetchInternalUser();
  const sanitized = PublicUserSchema.strip().parse(internalUser);

  return res.json({
    user: sanitized,
    status: "success",
  });
}
```

#### Invalid Patterns

❌ **Missing validation:**
```typescript
export default async function handler(req, res) {
  const internalUser = await fetchInternalUser();
  return res.json(internalUser); // Error: No validation!
}
```

❌ **Missing .strip() call:**
```typescript
export default async function handler(req, res) {
  const internalUser = await fetchInternalUser();
  const sanitized = PublicUserSchema.parse(internalUser); // Error: Missing .strip()!
  return res.json(sanitized);
}
```

❌ **Unvalidated data in object:**
```typescript
export default async function handler(req, res) {
  const internalData = await fetchData();
  return res.json({
    data: internalData, // Error: internalData not validated!
    status: "ok",
  });
}
```

#### Configuration

```javascript
{
  "rules": {
    "dust/require-schema-validation": ["error", {
      "strictness": "strict",        // "strict" | "flexible" | "custom"
      "requireStrip": true,           // Require .strip() before .parse()
      "ignoredPaths": [               // Paths to ignore
        "**/internal/**",
        "**/lib/**"
      ],
      "customValidators": [           // Custom validation function names
        "validateAndStrip",
        "sanitizeResponse"
      ]
    }]
  }
}
```

#### Options

- **`strictness`** (default: `"strict"`):
  - `"strict"`: Requires explicit `.strip().parse()` chain
  - `"flexible"`: Accepts equivalent patterns like `.safeParse()`
  - `"custom"`: Allows custom validation patterns

- **`requireStrip`** (default: `true`):
  - When `true`, requires `.strip()` before `.parse()` to remove unknown fields
  - When `false`, allows `.parse()` without `.strip()`

- **`ignoredPaths`** (default: `[]`):
  - Array of glob patterns for paths to ignore
  - Example: `["**/internal/**", "**/test/**"]`

- **`customValidators`** (default: `[]`):
  - Array of custom validation function names to recognize
  - Example: `["validateAndStrip", "sanitizeForPublic"]`

#### When the Rule Applies

This rule only applies to:
- Files in `/pages/api/v1/` directories (public API routes)
- Non-test files (excludes `*.test.ts`, `*.spec.ts`)

The rule does NOT apply to:
- Internal API routes (e.g., `/pages/api/internal/`)
- Library/utility files
- Test files
- Files in configured `ignoredPaths`

#### Error Messages

The rule provides clear, actionable error messages:

```
error: Public API response must be validated with Zod schema before returning
  --> src/pages/api/v1/users/[id].ts:15:10
   |
15 |   return res.json(internalUserData);
   |          ^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: Add schema validation: PublicUserSchema.strip().parse(internalUserData)
```

## Development

### Running Tests

```bash
npm test
```

### Adding a New Rule

1. Create a new file in `rules/` directory
2. Export an object with `meta` and `create` properties
3. Add the rule to `index.js`
4. Create tests in `__tests__/` directory
5. Update this README

## License

MIT
