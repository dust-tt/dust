# io-ts → zod Migration Summary

## Overview

This migration will replace `io-ts` with `zod` for runtime type validation and schema definition in the `@connectors` package. The migration is designed to be done incrementally across **16 small PRs** to ensure easy review and minimal risk.

## Documentation

- **[Migration Strategy](./IO_TS_TO_ZOD_MIGRATION_STRATEGY.md)**: Detailed step-by-step plan with PR breakdown
- **[Quick Reference](./IO_TS_TO_ZOD_QUICK_REFERENCE.md)**: Code pattern translations and examples

## Why Migrate?

- **Better TypeScript integration**: zod has superior TypeScript inference
- **More concise syntax**: Less boilerplate than io-ts
- **Better error messages**: More detailed and user-friendly by default
- **Active maintenance**: zod is actively maintained and widely adopted
- **Easier to learn**: More intuitive API for new team members

## Migration Approach

### Key Principles

1. **Incremental**: Each PR focuses on one logical area
2. **Non-breaking**: Code works with both libraries during transition
3. **Testable**: Each PR can be tested independently
4. **Reviewable**: Small PRs (<500 lines) for easy review

### PR Breakdown

| Phase       | PRs   | Focus Area                        | Estimated Time |
| ----------- | ----- | --------------------------------- | -------------- |
| **Phase 1** | #1    | Add zod + Utilities + First Types | 2-3 days       |
| **Phase 2** | #2-4  | Simple Type Files                 | 2-3 days each  |
| **Phase 3** | #5-8  | API Handlers                      | 2-3 days each  |
| **Phase 4** | #9-13 | Connector-Specific Code           | 1-2 days each  |
| **Phase 5** | #14   | Complex Types                     | 2-3 days       |
| **Phase 6** | #15   | Cleanup                           | 1 day          |

**Total Estimated Time**: 5-7 weeks with proper review cycles (15 PRs total)

**Note**: zod dependency is added in PR #1 (the first PR that uses it)

## Current Usage

- **~30+ files** use io-ts
- **Main patterns**:
  - Schema definitions (`t.type()`, `t.union()`, `t.literal()`)
  - Type extraction (`t.TypeOf<>`)
  - Validation (`codec.decode()` with `isLeft()`)
  - Error reporting (`io-ts-reporters`)
  - Custom codecs and branded types

## Quick Start

### For Reviewers

1. Read the [Migration Strategy](./IO_TS_TO_ZOD_MIGRATION_STRATEGY.md) to understand the overall plan
2. Use the [Quick Reference](./IO_TS_TO_ZOD_QUICK_REFERENCE.md) to verify pattern translations
3. Focus on:
   - Schema equivalence (same validation rules)
   - Type correctness (TypeScript types match)
   - Error handling (errors are properly formatted)

### For Implementers

1. Start with **PR #1**: Set up zod utilities
2. Follow the PR order in the [Migration Strategy](./IO_TS_TO_ZOD_MIGRATION_STRATEGY.md)
3. Use the [Quick Reference](./IO_TS_TO_ZOD_QUICK_REFERENCE.md) for pattern translations
4. Test thoroughly before submitting PR

## Common Patterns

### Schema Definition

```typescript
// Before (io-ts)
const Schema = t.type({
  name: t.string,
  age: t.number,
});

// After (zod)
const Schema = z.object({
  name: z.string(),
  age: z.number(),
});
```

### Type Extraction

```typescript
// Before
type MyType = t.TypeOf<typeof Schema>;

// After
type MyType = z.infer<typeof Schema>;
```

### Validation

```typescript
// Before
const result = Schema.decode(data);
if (isLeft(result)) {
  const errors = reporter.formatValidationErrors(result.left);
  return Err(errors);
}
return Ok(result.right);

// After
const result = Schema.safeParse(data);
if (!result.success) {
  return Err(result.error.errors.map((e) => e.message));
}
return Ok(result.data);
```

See [Quick Reference](./IO_TS_TO_ZOD_QUICK_REFERENCE.md) for more patterns.

## Success Criteria

- ✅ All io-ts imports removed
- ✅ All tests passing
- ✅ No runtime behavior changes
- ✅ Type safety maintained
- ✅ Error messages remain clear

## Questions?

- Check the [Migration Strategy](./IO_TS_TO_ZOD_MIGRATION_STRATEGY.md) for detailed plans
- Refer to [Quick Reference](./IO_TS_TO_ZOD_QUICK_REFERENCE.md) for code examples
- Review existing zod migrations in the codebase for patterns
