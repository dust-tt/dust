---
tags: [lint, nextjs]
level: warn
---

# No data fetching in getServerSideProps

Warns when `getServerSideProps` is defined. Only `owner` and context params
should be returned. Fetch data client-side using SWR hooks instead.

```grit
language js

getServerSideProps_definition() => `GSSP_FLAGGED`
```

## Should flag getServerSideProps definition in pages

```typescript
// @filename: front/pages/index.tsx
const getServerSideProps = async (context) => {
  return { props: {} };
};
```

```typescript
// @filename: front/pages/index.tsx
GSSP_FLAGGED
```

## Should not flag getServerSideProps outside pages

```typescript
// @filename: front/lib/utils.ts
const getServerSideProps = async (context) => {
  return { props: {} };
};
```

## Should not flag other const declarations

```typescript
// @filename: front/pages/index.tsx
const getStaticProps = async () => {
  return { props: {} };
};
```
