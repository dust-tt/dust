---
tags: [lint, mcp]
level: warn
---

# No MCP server instructions

Disallows non-null instructions in MCP server metadata definitions.
Tools should be self-explanatory and avoid coupling instructions.

```grit
language js

`serverInfo: { $props }` where {
    $props <: contains `instructions: $val` where {
        $val <: not `null`,
        $val => `MCP_INSTRUCTIONS_FORBIDDEN`
    }
}
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
  serverInfo: {
    instructions: MCP_INSTRUCTIONS_FORBIDDEN,
  },
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
