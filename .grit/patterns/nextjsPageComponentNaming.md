---
tags: [lint, nextjs]
level: error
---

# NextJS page component naming

Ensures NextJS page default exports follow the naming pattern with `NextJS` suffix.

```grit
language js

non_nextjs_page_export() => `NEEDS_NEXTJS_SUFFIX`
```

## Should flag export without NextJS suffix in pages

```typescript
// @filename: front/pages/index.tsx
export default function MyPage(props) {
  return <div />;
}
```

```typescript
// @filename: front/pages/index.tsx
NEEDS_NEXTJS_SUFFIX
```

## Should not flag export with NextJS suffix

```typescript
// @filename: front/pages/index.tsx
export default function MyPageNextJS(props) {
  return <div />;
}
```

## Should not flag export outside pages

```typescript
// @filename: front/components/MyComponent.tsx
export default function MyPage(props) {
  return <div />;
}
```
