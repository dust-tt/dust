---
tags: [lint, mcp]
level: warn
---

# No MCP server instructions

Disallows non-null instructions in MCP server metadata definitions.
Tools should be self-explanatory and avoid coupling instructions.

```grit
language js

mcp_server_non_null_instructions() => `MCP_INSTRUCTIONS_FORBIDDEN`
```

## Should flag non-null instructions

```typescript
const server = {
  serverInfo: {
    instructions: "Always call tool A before tool B",
  },
};
```

```typescript
const server = {
  MCP_INSTRUCTIONS_FORBIDDEN,
};
```

## Should not flag null instructions

```typescript
const server = {
  serverInfo: {
    instructions: null,
  },
};
```
