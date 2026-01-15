---
name: dust-mcp-server
description: Step-by-step guide for creating new internal MCP server integrations in Dust that connect to remote platforms (Jira, HubSpot, Salesforce, etc.). Use when adding a new MCP server, implementing a platform integration, or connecting Dust to a new external service.
---

# Adding Internal MCP Server Integrations

This skill guides you through creating new internal MCP server integrations in Dust that connect to remote platforms.

## Quick Reference

### Minimal Files Needed

1. `front/lib/actions/mcp_internal_actions/constants.ts` - Add server to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES` and `INTERNAL_MCP_SERVERS`
2. `front/lib/actions/mcp_internal_actions/servers/{provider}.ts` - Server implementation with tools
3. `front/lib/actions/mcp_internal_actions/servers/index.ts` - Register server in switch statement

If the server code does not fit in one file, split into a folder with `index.ts` default-exporting `createServer`.

### OAuth Requirements (if needed)

- OAuth provider must exist in `front/lib/api/oauth/providers/{provider}.ts`
- OAuth core implementation must exist in `core/src/oauth/providers/{provider}.rs`
- Server's `authorization` field must reference the OAuth provider

### Common Gotchas

- Add server to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES` array
- Server IDs must be stable and unique - never change after deployment
- Configure tool stakes appropriately (never_ask, low, high)
- Always implement proper error handling with Result types

## Prerequisites

### OAuth Configuration Check

If the platform requires OAuth:

1. Check if OAuth provider exists: `core/src/oauth/providers/{provider}.rs`
2. Check if front OAuth provider exists: `front/lib/api/oauth/providers/{provider}.ts`

If OAuth provider does NOT exist, implement it first in `core` or ask the user if they want to proceed with that first.

### Research Phase

Before implementing, research:

1. **API Documentation** - REST vs GraphQL vs SDK, rate limits, pagination
2. **Authentication** - OAuth 2.0 (preferred) or API Key/Bearer Token
3. **Operations** - Read (list, get, search), Write (create, update, delete), Special operations

## Step-by-Step Implementation

### Step 1: Add Server to Constants

Edit `front/lib/actions/mcp_internal_actions/constants.ts`:

```typescript
// 1. Add to AVAILABLE_INTERNAL_MCP_SERVER_NAMES array
export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // ... existing servers
  "your_provider", // <- Add here (alphabetically sorted)
] as const;

// 2. Add to INTERNAL_MCP_SERVERS object
export const INTERNAL_MCP_SERVERS = {
  your_provider: {
    id: 99, // Use next available unique ID
    availability: "manual", // or "auto"
    allowMultipleInstances: true, // true for OAuth-based
    isRestricted: undefined,
    isPreview: false,
    tools_stakes: {
      get_item: "never_ask",
      list_items: "never_ask",
      create_item: "low",
      delete_item: "high",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "your_provider",
      version: "1.0.0",
      description: "Short description.",
      authorization: {
        provider: "your_provider" as const,
        supported_use_cases: ["platform_actions", "personal_actions"] as const,
      },
      icon: "YourProviderLogo",
      documentationUrl: "https://docs.dust.tt/docs/your-provider",
      instructions: null,
    },
  },
};
```

### Step 2: Create API Helper

Create `front/lib/actions/mcp_internal_actions/servers/{provider}/{provider}_api_helper.ts`:

- Define TypeScript interfaces for API responses
- Export async functions for each API operation
- Use `Result<T, Error>` return types from `@app/types`
- Accept `accessToken` as first parameter for OAuth APIs

See `servers/jira/jira_api_helper.ts` or `servers/hubspot/hubspot_api_helper.ts` for examples.

### Step 3: Create Utility Functions (Optional)

Create `front/lib/actions/mcp_internal_actions/servers/{provider}/{provider}_utils.ts`:

- `withAuth` helper to extract OAuth token and handle errors
- Error message constants
- Response formatting helpers

See `servers/hubspot/hubspot_utils.ts` for reference.

### Step 4: Create Server Implementation

Create `front/lib/actions/mcp_internal_actions/servers/{provider}/index.ts`:

1. Export default function creating McpServer
2. Use `makeInternalMCPServer("your_provider")`
3. Register tools with `server.tool()`:
   - Tool name (must match `tools_stakes` key)
   - Description
   - Zod schema with `.describe()` for each field
   - Async handler using `withAuth` wrapper

See `servers/jira/index.ts` or `servers/notion.ts` for examples.

### Step 5: Register Server in Index

Edit `front/lib/actions/mcp_internal_actions/servers/index.ts`:

1. Add import at top
2. Add case in `getInternalMCPServer` switch statement

### Step 6: Icon

Use an existing similar icon temporarily. Request final icon from designer for Sparkle.

## Tool Stakes Guide

| Stake Level | When to Use | Examples |
|-------------|-------------|----------|
| `never_ask` | Read-only, no side effects | list_items, get_item, search |
| `low` | Write with minimal impact | create_comment, add_tag |
| `high` | Destructive/high-impact | delete_item, send_email |

## Best Practices

### Error Handling

Use Result types. Translate API errors into actionable messages.

### Response Rendering (Important for Token Efficiency)

Implement functions converting API output to clean, focused, Markdown text. See `servers/zendesk/rendering.ts`.

**Do:**
- Select only relevant fields
- Start with brief summary
- Use consistent formats

**Don't:**
- Return raw `JSON.stringify(apiResponse)`
- Include pagination metadata, rate limit info

### Tool Descriptions

Write clear descriptions including:
- What the tool does
- Required vs optional parameters
- What it returns
- Limitations/prerequisites

### Validate External API Responses

Use Zod schemas to validate external API responses:

```typescript
const ItemSchema = z.object({
  id: z.number(),
  name: z.string(),
}).passthrough();

const parseResult = schema.safeParse(rawData);
if (!parseResult.success) {
  return new Err(new Error(`Invalid API response: ${parseResult.error.message}`));
}
```

See `servers/zendesk/types.ts` and `servers/zendesk/client.ts` for examples.

## Validation Checklist

- [ ] Server added to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`
- [ ] Server configuration added to `INTERNAL_MCP_SERVERS`
- [ ] Server registered in `servers/index.ts` switch statement
- [ ] API helper functions with proper error handling
- [ ] All tools defined with appropriate stakes
- [ ] Response pruning implemented
- [ ] OAuth provider configured (if needed)
- [ ] Temporary icon set
- [ ] Feature flag configured (if preview)
- [ ] Manual testing completed

## Troubleshooting

### Server Not Appearing in Builder

- Check `availability` setting
- Check `isRestricted` function
- Verify server is in `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`

### OAuth Connection Failing

- Verify OAuth provider exists in both `core` and `front`
- Check client ID/secret environment variables
- Verify redirect URI whitelisted
- Check OAuth scopes

### Tools Not Working

- Verify tool registered in server
- Check `tools_stakes` includes tool name
- Test API helpers directly
- Check authInfo.token passed correctly

### Type Errors

- Ensure server name in `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`
- Run `npm run type-check`

## Reference Implementations

- **Simple OAuth**: `servers/hubspot/`
- **Complex with pagination**: `servers/jira/`
- **Multiple auth use cases**: `servers/github/`
