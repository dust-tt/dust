---
tags: [lint, i18n]
level: error
---

# No raw API error messages in the UI

UI code must not show the server `message` of an API error: it is English-only, and private
endpoints omit it when it only restates the error type. Use `useFormatAPIError()` from
`@app/hooks/useFormatAPIError`, which translates the error type and appends the server message as
raw context when there is one.

Files that predate the rule are listed as `!` exclusions in `biome.json`. Remove a file from that
list when you migrate it.

```grit
language js

or {
    `$obj.error.message`,
    `$obj.error?.message`,
    `$obj?.error?.message`,
    `getErrorFromResponse($...)`
} as $match where {
    $obj <: not or { `fieldState`, `field`, r"^formState.*" }
} => `RAW_API_ERROR_MESSAGE_FORBIDDEN`
```

## Should flag reading the message of an API error

```typescript
const description = err.error.message;
```

```typescript
const description = RAW_API_ERROR_MESSAGE_FORBIDDEN;
```

## Should flag `getErrorFromResponse`

```typescript
const errorData = getErrorFromResponse(res);
```

```typescript
const errorData = RAW_API_ERROR_MESSAGE_FORBIDDEN;
```

## Should not flag react-hook-form field errors

```typescript
const description = fieldState.error?.message;
```

## Should not flag the error type

```typescript
const isNotFound = err.error.type === "user_not_found";
```
