# Migration Strategy: io-ts → zod

This document outlines a step-by-step strategy to migrate from io-ts to zod in the `@connectors` package, broken down into small, reviewable PRs.

## Overview

The migration will be done incrementally, allowing the codebase to work with both libraries during the transition. Each PR will focus on a specific area to make reviews manageable.

## Current State

- **io-ts** is used in ~30+ files across the codebase
- Main usage patterns:
  - Schema definitions (`t.type()`, `t.union()`, `t.literal()`, etc.)
  - Type extraction (`t.TypeOf<>`)
  - Validation (`codec.decode()` with `isLeft()` from fp-ts)
  - Error reporting (`io-ts-reporters`)
  - Custom codecs and branded types
  - Utility functions in `src/types/shared/utils/iots_utils.ts`

## Migration Strategy (Multiple PRs)

### Phase 1: First Migration (PR #1)

**Goal**: Add zod dependency and migrate first simple types

**Changes**:

1. Add `zod` to `package.json` dependencies (first PR using zod)
2. Create `src/types/shared/utils/zod_utils.ts` with equivalent utilities:
   - `zodEnum()` - equivalent to `ioTsEnum()`
   - `zodParsePayload()` - equivalent to `ioTsParsePayload()`
   - `createRangeCodec()` - equivalent using zod's `refine()`
   - `SlugifiedString` - equivalent using zod's `brand()`
   - `NumberAsStringCodec` - equivalent custom refinement
3. Migrate first simple type files:
   - `src/types/webcrawler.ts`
   - `src/types/discord_bot.ts`
   - `src/types/slack.ts`
4. Update imports in files that use these types
5. Keep `iots_utils.ts` intact (will be removed in final PR)

**Files to create/modify**:

- `package.json` (add zod)
- `src/types/shared/utils/zod_utils.ts` (new)
- `src/types/shared/utils/zod_utils.test.ts` (new, if tests exist)
- `src/types/webcrawler.ts`
- `src/types/discord_bot.ts`
- `src/types/slack.ts`
- Files that import these types

**Review focus**: zod dependency addition, utility functions correctness, schema equivalence

---

### Phase 2: Migrate Simple Type Files (PRs #2-4)

**Goal**: Migrate remaining standalone type definition files that have minimal dependencies

**PR #2: Migrate OAuth Types (Part 1)**

- Migrate simple schemas in `src/types/oauth/lib.ts`:
  - `SnowflakeCredentialsSchema` and related
  - `BigQueryCredentialsSchema` and related
  - `ApiKeyCredentialsSchema`
  - `SalesforceCredentialsSchema`
  - `NotionCredentialsSchema`
- Keep type guards and helper functions unchanged initially

**PR #3: Migrate Configuration Types**

- `src/types/configuration.ts`
- Update `src/api/create_connector.ts` to use zod schemas
- Update `src/api/update_connector.ts` to use zod schemas

**PR #4: Migrate Remaining Simple Types**

- `src/types/notion.ts`
- `src/types/content_nodes.ts`
- `src/types/admin/cli.ts`

**Review focus**: Schema equivalence, type extraction correctness

---

### Phase 3: Migrate API Handlers (PRs #5-8)

**Goal**: Migrate API request/response validation

**PR #5: Migrate Connector API Handlers**

- `src/api/create_connector.ts`
- `src/api/update_connector.ts`
- `src/api/connector_config.ts`
- `src/api/set_connector_permissions.ts`
- Replace `codec.decode()` with `zodSchema.safeParse()`
- Replace `reporter.formatValidationErrors()` with zod error formatting

**PR #6: Migrate Webhook Handlers (Part 1)**

- `src/api/webhooks/webhook_slack_interaction.ts`
- `src/api/webhooks/webhook_slack_bot_interaction.ts`
- `src/api/webhooks/webhook_slack_bot.ts`

**PR #7: Migrate Webhook Handlers (Part 2)**

- `src/api/webhooks/webhook_github.ts`
- `src/api/webhooks/webhook_notion.ts`
- `src/api/webhooks/webhook_intercom.ts`
- `src/api/webhooks/webhook_discord_app.ts`
- `src/api/webhooks/webhook_teams.ts`
- `src/api/webhooks/webhook_firecrawl.ts`

**PR #8: Migrate Remaining API Handlers**

- `src/api/slack_channels_linked_with_agent.ts`
- `src/api/admin.ts`
- `src/admin/cli.ts`

**Review focus**: Validation logic correctness, error handling

---

### Phase 4: Migrate Connector-Specific Code (PRs #9-13)

**Goal**: Migrate connector implementation files

**PR #9: Migrate Shared Connector Utilities**

- `src/lib/cli.ts`
- `src/connectors/microsoft/lib/cli.ts`
- `src/lib/remote_databases/utils.ts`

**PR #10: Migrate GitHub Connector**

- `src/connectors/github/lib/github_api.ts`
- `src/connectors/github/lib/github_graphql.ts`
- `src/connectors/github/lib/github_webhooks.ts`

**PR #11: Migrate Snowflake & BigQuery Connectors**

- `src/connectors/snowflake/lib/snowflake_api.ts`
- Any BigQuery-related validation code

**PR #12: Migrate Gong & Confluence Connectors**

- `src/connectors/gong/lib/gong_api.ts`
- `src/connectors/gong/lib/oauth.ts`
- `src/connectors/confluence/lib/confluence_client.ts`

**PR #13: Migrate Remaining Connectors**

- `src/connectors/notion/lib/utils.ts`
- `src/connectors/slack/chat/stream_conversation_handler.ts`
- Any other connector-specific validation

**Review focus**: Connector-specific validation logic

---

### Phase 5: Migrate Complex Types & Utilities (PR #14)

**Goal**: Migrate remaining complex type definitions

**Changes**:

- `src/types/oauth/lib.ts` - remaining complex schemas
- `src/types/shared/text_extraction/index.ts`
- `src/lib/data_sources.ts` (if it uses io-ts types)

**Review focus**: Complex schema migrations, edge cases

---

### Phase 6: Cleanup (PR #15)

**Goal**: Remove io-ts dependencies and old utilities

**Changes**:

1. Remove `io-ts`, `io-ts-reporters`, `io-ts-types` from `package.json`
2. Delete `src/types/shared/utils/iots_utils.ts`
3. Remove all `import * as t from "io-ts"` statements
4. Remove all `import * as reporter from "io-ts-reporters"` statements
5. Remove `isLeft` imports from `fp-ts/lib/Either` (if only used for io-ts)
6. Update any remaining references
7. Run full test suite

**Review focus**: No remaining io-ts references, all tests pass

---

## Key Migration Patterns

### Schema Definition

```typescript
// io-ts
const Schema = t.type({
  name: t.string,
  age: t.number,
  email: t.union([t.string, t.undefined]),
});

// zod
const Schema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().optional(),
});
```

### Type Extraction

```typescript
// io-ts
type MyType = t.TypeOf<typeof Schema>;

// zod
type MyType = z.infer<typeof Schema>;
```

### Validation

```typescript
// io-ts
const result = Schema.decode(data);
if (isLeft(result)) {
  const errors = reporter.formatValidationErrors(result.left);
  return Err(errors);
}
return Ok(result.right);

// zod
const result = Schema.safeParse(data);
if (!result.success) {
  return Err(result.error.errors.map((e) => e.message));
}
return Ok(result.data);
```

### Union Types

```typescript
// io-ts
const UnionSchema = t.union([t.string, t.number]);

// zod
const UnionSchema = z.union([z.string(), z.number()]);
```

### Literal Types

```typescript
// io-ts
const LiteralSchema = t.union([t.literal("option1"), t.literal("option2")]);

// zod
const LiteralSchema = z.enum(["option1", "option2"]);
// or
const LiteralSchema = z.union([z.literal("option1"), z.literal("option2")]);
```

### Branded Types

```typescript
// io-ts
const BrandedString = t.brand(
  t.string,
  (s): s is t.Branded<string, Brand> => /^[a-z]+$/.test(s),
  "Brand"
);

// zod
const BrandedString = z
  .string()
  .refine((s) => /^[a-z]+$/.test(s))
  .brand<"Brand">();
```

### Custom Codecs

```typescript
// io-ts
const NumberAsString = new t.Type<string, string, unknown>(
  "NumberAsString",
  (u): u is string => typeof u === "number",
  (u, c) => {
    if (typeof u === "number") {
      return t.success(u.toString());
    }
    return t.failure(u, c, "Value must be a number");
  },
  t.identity
);

// zod
const NumberAsString = z
  .union([z.number().transform((n) => n.toString()), z.string()])
  .refine((val) => !isNaN(Number(val)), {
    message: "Value must be a number",
  });
```

## Testing Strategy

1. **Unit Tests**: Ensure zod utilities match io-ts behavior
2. **Integration Tests**: Test each migrated API endpoint
3. **Type Tests**: Ensure TypeScript types are correctly inferred
4. **Regression Tests**: Run full test suite after each PR

## Rollback Plan

If issues arise:

1. Each PR should be independently revertible
2. Keep io-ts in dependencies until final cleanup PR
3. Can run both validations side-by-side during transition if needed

## Success Criteria

- ✅ All io-ts imports removed
- ✅ All tests passing
- ✅ No runtime behavior changes
- ✅ Type safety maintained
- ✅ Error messages remain clear and helpful

## Estimated Timeline

- **PR #1**: 2-3 days (add zod dependency + utilities + first type migrations)
- **PRs #2-4**: 2-3 days each (type migrations)
- **PRs #5-8**: 2-3 days each (API handlers)
- **PRs #9-13**: 1-2 days each (connectors)
- **PR #14**: 2-3 days (complex types)
- **PR #15**: 1 day (cleanup)

**Total**: ~5-7 weeks with proper review cycles (15 PRs total)

## Notes

- Each PR should be small enough to review in <30 minutes
- Focus on one logical area per PR
- Maintain backward compatibility during transition
- Update this document as migration progresses
