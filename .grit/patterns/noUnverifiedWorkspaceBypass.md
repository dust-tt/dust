---
tags: [lint, security]
level: warn
---

# No unverified workspace bypass

Flags all uses of `dangerouslyBypassWorkspaceIsolationSecurity: true`.
Developers must ensure a preceding comment starting with `WORKSPACE_ISOLATION_BYPASS:` is present.

```grit
language js

`dangerouslyBypassWorkspaceIsolationSecurity: true` => `WORKSPACE_BYPASS_FLAGGED`
```

## Should flag workspace bypass

```typescript
const opts = {
  dangerouslyBypassWorkspaceIsolationSecurity: true,
};
```

```typescript
const opts = {
  WORKSPACE_BYPASS_FLAGGED,
};
```

## Should not flag when set to false

```typescript
const opts = {
  dangerouslyBypassWorkspaceIsolationSecurity: false,
};
```
