---
tags: [lint, nextjs]
level: warn
---

# No data fetching in getServerSideProps

Warns when `getServerSideProps` is defined. Only `owner` and context params
should be returned. Fetch data client-side using SWR hooks instead.

Note: The original Biome plugin uses `$filename` filtering which cannot be tested
in grit. This test validates the core matching logic only.

```grit
language js

`const getServerSideProps = $init` => `GSSP_FLAGGED`
```

## Should flag getServerSideProps definition

```typescript
const getServerSideProps = async (context) => {
  return { props: {} };
};
```

```typescript
GSSP_FLAGGED
```

## Should not flag other const declarations

```typescript
const getStaticProps = async () => {
  return { props: {} };
};
```
