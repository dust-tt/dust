---
tags: [lint, nextjs]
level: error
---

# NextJS page component naming

Ensures NextJS page default exports follow the naming pattern with `NextJS` suffix.

Note: The original Biome plugin uses `$filename` filtering and negative regex on the
function name. This test validates the core matching logic only.

```grit
language js

`export default function $name($params) { $body }` where {
    $name <: not r".*NextJS$",
    $name => `NEEDS_NEXTJS_SUFFIX`
}
```

## Should flag export without NextJS suffix

```typescript
export default function MyPage(props) {
  return <div />;
}
```

```typescript
export default function NEEDS_NEXTJS_SUFFIX(props) {
  return <div />;
}
```

## Should not flag export with NextJS suffix

```typescript
export default function MyPageNextJS(props) {
  return <div />;
}
```
