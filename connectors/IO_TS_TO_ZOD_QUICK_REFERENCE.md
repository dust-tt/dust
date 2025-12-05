# io-ts → zod Quick Reference Guide

This is a quick reference for common io-ts to zod migration patterns found in the codebase.

## Basic Types

| io-ts         | zod                              |
| ------------- | -------------------------------- |
| `t.string`    | `z.string()`                     |
| `t.number`    | `z.number()`                     |
| `t.boolean`   | `z.boolean()`                    |
| `t.null`      | `z.null()`                       |
| `t.undefined` | `.optional()` or `z.undefined()` |
| `t.any`       | `z.any()`                        |
| `t.unknown`   | `z.unknown()`                    |

## Complex Types

| io-ts                                       | zod                                    |
| ------------------------------------------- | -------------------------------------- |
| `t.type({ a: t.string })`                   | `z.object({ a: z.string() })`          |
| `t.array(t.string)`                         | `z.array(z.string())`                  |
| `t.union([t.string, t.number])`             | `z.union([z.string(), z.number()])`    |
| `t.intersection([A, B])`                    | `A.merge(B)` or `z.intersection(A, B)` |
| `t.record(t.string, t.string)`              | `z.record(z.string(), z.string())`     |
| `t.literal("value")`                        | `z.literal("value")`                   |
| `t.union([t.literal("a"), t.literal("b")])` | `z.enum(["a", "b"])`                   |

## Optional & Nullable

| io-ts                                      | zod                     |
| ------------------------------------------ | ----------------------- |
| `t.union([t.string, t.undefined])`         | `z.string().optional()` |
| `t.union([t.string, t.null])`              | `z.string().nullable()` |
| `t.union([t.string, t.null, t.undefined])` | `z.string().nullish()`  |

## Type Extraction

| io-ts                              | zod                               |
| ---------------------------------- | --------------------------------- |
| `type T = t.TypeOf<typeof Schema>` | `type T = z.infer<typeof Schema>` |

## Validation

### io-ts Pattern

```typescript
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

const result = Schema.decode(data);
if (isLeft(result)) {
  const errors = reporter.formatValidationErrors(result.left);
  return Err(errors);
}
return Ok(result.right);
```

### zod Pattern

```typescript
const result = Schema.safeParse(data);
if (!result.success) {
  const errors = result.error.errors.map(
    (e) => `${e.path.join(".")}: ${e.message}`
  );
  return Err(errors);
}
return Ok(result.data);
```

## Custom Codecs

### Enum Codec

**io-ts:**

```typescript
export function ioTsEnum<EnumType>(
  enumValues: readonly string[],
  enumName?: string
) {
  const isEnumValue = (input: unknown): input is EnumType =>
    enumValues.includes(input as string);

  return new t.Type<EnumType>(
    enumName || uuidv4(),
    isEnumValue,
    (input, context) =>
      isEnumValue(input) ? t.success(input) : t.failure(input, context),
    t.identity
  );
}
```

**zod:**

```typescript
export function zodEnum<EnumType extends string>(
  enumValues: readonly EnumType[],
  enumName?: string
) {
  return z.enum(enumValues as [EnumType, ...EnumType[]], {
    errorMap: () => ({
      message: `${enumName || "Value"} must be one of: ${enumValues.join(", ")}`,
    }),
  });
}
```

### Branded Types

**io-ts:**

```typescript
const SlugifiedString = t.brand(
  t.string,
  (s): s is t.Branded<string, SlugifiedStringBrand> => /^[a-z0-9_]+$/.test(s),
  "SlugifiedString"
);
```

**zod:**

```typescript
const SlugifiedString = z
  .string()
  .refine((s) => /^[a-z0-9_]+$/.test(s), {
    message:
      "Must be a slugified string (lowercase letters, numbers, underscores only)",
  })
  .brand<"SlugifiedString">();
```

### Range Codec

**io-ts:**

```typescript
export function createRangeCodec(min: number, max: number) {
  return t.brand(
    t.number,
    (n): n is t.Branded<number, BrandedRange> => n >= min && n <= max,
    "Range"
  );
}
```

**zod:**

```typescript
export function createRangeCodec(min: number, max: number) {
  return z.number().min(min).max(max).brand<"Range">();
}
```

### Number as String Codec

**io-ts:**

```typescript
export const NumberAsStringCodec = new t.Type<string, string, unknown>(
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
```

**zod:**

```typescript
export const NumberAsStringCodec = z.union([
  z.number().transform((n) => n.toString()),
  z.string().refine((s) => !isNaN(Number(s)), {
    message: "Value must be a number",
  }),
]);
```

## Error Formatting

### io-ts-reporters

```typescript
import * as reporter from "io-ts-reporters";
const errors = reporter.formatValidationErrors(validation.left);
// Returns: string[]
```

### zod (custom formatter)

```typescript
function formatZodErrors(error: z.ZodError): string[] {
  return error.errors.map((e) => {
    const path = e.path.join(".");
    return path ? `${path}: ${e.message}` : e.message;
  });
}
```

## Common Patterns in Codebase

### Configuration Schema

```typescript
// io-ts
const ConfigSchema = t.type({
  name: t.string,
  enabled: t.boolean,
  options: t.union([t.array(t.string), t.undefined]),
});

// zod
const ConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  options: z.array(z.string()).optional(),
});
```

### Union with Null

```typescript
// io-ts
const Schema = t.union([SomeTypeSchema, t.null]);

// zod
const Schema = z.union([SomeTypeSchema, z.null()]);
```

### Intersection Types

```typescript
// io-ts
const BaseSchema = t.type({ a: t.string });
const ExtendedSchema = t.intersection([BaseSchema, t.type({ b: t.number })]);

// zod
const BaseSchema = z.object({ a: z.string() });
const ExtendedSchema = BaseSchema.extend({ b: z.number() });
// or
const ExtendedSchema = z.intersection(BaseSchema, z.object({ b: z.number() }));
```

### Record Types

```typescript
// io-ts
const HeadersSchema = t.record(t.string, t.string);

// zod
const HeadersSchema = z.record(z.string(), z.string());
```

### Catch-All Pattern (Allowing Unknown Properties)

This pattern is used in Gong and Confluence connectors to allow extra properties:

**io-ts:**

```typescript
const CatchAllCodec = t.record(t.string, t.unknown);
const Schema = t.intersection([t.type({ known: t.string }), CatchAllCodec]);
```

**zod:**

```typescript
const Schema = z
  .object({
    known: z.string(),
  })
  .passthrough(); // Allows unknown properties
// or
const Schema = z
  .object({
    known: z.string(),
  })
  .catchall(z.unknown()); // Explicitly catch unknown properties
```

## Testing Migration

When migrating a file:

1. **Create zod schema** alongside io-ts schema
2. **Test both schemas** with same inputs
3. **Compare outputs** - should be identical
4. **Update imports** and usage
5. **Remove io-ts schema** once verified

## Notes

- zod schemas are more concise
- zod has better TypeScript inference
- zod error messages are more detailed by default
- zod supports `.transform()` for data transformation
- zod `.refine()` replaces custom codec validation logic
