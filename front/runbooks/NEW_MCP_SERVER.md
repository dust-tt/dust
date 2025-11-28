# MCP Server Runbook: Adding Internal MCP Server Integrations for Remote Platforms

This runbook provides step-by-step instructions for creating new internal MCP server integrations in Dust that connect to remote platforms (e.g., Jira, HubSpot, Salesforce, etc.).

---

## Quick Reference

### Minimal Files Needed

1. `lib/actions/mcp_internal_actions/constants.ts` - Add server to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES` and `INTERNAL_MCP_SERVERS`
2. `lib/actions/mcp_internal_actions/servers/{provider}.ts` - Server implementation with tools
3. `lib/actions/mcp_internal_actions/servers/index.ts` - Register server in switch statement

If the server code does not fit in one file, it can be split into multiple files.
In that case, they should be placed into a folder that contains a file `index.ts` from where
the `createServer` function that creates the server will be default exported.

### OAuth Requirements (if the platform requires OAuth)

- OAuth provider must already exist in `front/lib/api/oauth/providers/{provider}.ts`
- OAuth core implementation must exist in `core/src/oauth/providers/{provider}.rs`
- OAuth scopes must be configured for the required API access
- Server's `authorization` field must reference the OAuth provider

### Common Gotchas

- Do not forget to add the server to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES` array
- Server IDs must be stable and unique - never change them once deployed
- Tool stakes must be configured appropriately (never_ask, low, high)
- Always implement proper error handling with Result types
- Handle OAuth token refresh automatically through the `withAuth` pattern

---

## Prerequisites

### OAuth Configuration (If Required)

If the remote platform requires OAuth authentication:

1. **Check if OAuth provider exists**: Look in `core/src/oauth/providers/` for a `{provider}.rs` file
2. **Check if front OAuth provider exists**: Look in `front/lib/api/oauth/providers/{provider}.ts`

**If OAuth provider does NOT exist**, you'll need to implement it first in `core`:

- Create `core/src/oauth/providers/{provider}.rs`
- Implement the OAuth flow (authorization URL, token exchange, refresh)
- Register the provider in `core/src/oauth/providers/mod.rs`
- Create `front/lib/api/oauth/providers/{provider}.ts` for the front-end OAuth setup

See existing providers like `hubspot.rs` or `jira.rs` for reference implementations.
If you're an LLM, maybe ask the user if he wants to implement it now or later.

### Research Phase

Before starting implementation, research the platform's API:

#### 1. API Documentation

- Find the official API documentation
- Identify REST endpoints vs GraphQL vs SDK usage
- Note rate limits and pagination requirements

#### 2. Authentication Method

- **OAuth 2.0** (preferred for user-facing integrations)
- **API Key / Bearer Token** (simpler but less secure)
- **OAuth Scopes**: What permissions are needed?

#### 3. Available Operations

Document the operations you want to expose:

- Read operations (list, get, search)
- Write operations (create, update, delete)
- Special operations (transitions, associations, etc.)

---

## File Structure

For each internal MCP server, you'll create:

```
front/lib/actions/mcp_internal_actions/servers/{provider}/
├── index.ts                    # Main server with tool definitions
├── {provider}_api_helper.ts    # API client and helper functions
├── {provider}_utils.ts         # Utility functions (optional)
└── types.ts                    # TypeScript types (optional)
```

---

## Step-by-Step Implementation

### Step 1: Add Server to Constants

Edit `lib/actions/mcp_internal_actions/constants.ts`:

```typescript
// 1. Add to AVAILABLE_INTERNAL_MCP_SERVER_NAMES array
export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // ... existing servers
  "your_provider", // <- Add here (alphabetically sorted helps)
  // ... more servers
] as const;

// 2. Add to INTERNAL_MCP_SERVERS object
export const INTERNAL_MCP_SERVERS = {
  // ... existing servers

  your_provider: {
    id: 99, // Use a unique ID - check existing IDs and pick the next available
    availability: "manual", // or "auto" for always-available servers
    allowMultipleInstances: true, // true for OAuth-based servers (multiple connections)
    isRestricted: undefined, // or a function for feature flag gating
    isPreview: false, // true if this is a preview feature
    tools_stakes: {
      // Read operations - typically "never_ask"
      get_item: "never_ask",
      list_items: "never_ask",
      search_items: "never_ask",

      // Write operations - "low" or "high" based on impact
      create_item: "low",
      update_item: "low",
      delete_item: "high",
    },
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    serverInfo: {
      name: "your_provider",
      version: "1.0.0",
      description: "Short description of what this integration does.",
      authorization: {
        provider: "your_provider" as const, // Must match OAuth provider name
        supported_use_cases: ["platform_actions", "personal_actions"] as const,
        // Optional: scope: "specific:scope" as const,
      },
      icon: "YourProviderLogo", // Must exist in resources_icons.tsx
      documentationUrl: "https://docs.dust.tt/docs/your-provider", // Optional
      instructions: null, // Optional server-level instructions
    },
  },

  // ... more servers
};
```

**Server Configuration Properties:**

| Property                 | Description                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `id`                     | Unique stable ID - never change after deployment                                                          |
| `availability`           | `"manual"` (user adds), `"auto"` (always available), `"auto_hidden_builder"` (auto but hidden in builder) |
| `allowMultipleInstances` | `true` for OAuth-based (multiple connections), `false` for singleton servers                              |
| `isRestricted`           | Function to check feature flags/plan restrictions, or `undefined`                                         |
| `isPreview`              | `true` for beta features                                                                                  |
| `tools_stakes`           | Map of tool names to stake levels (`"never_ask"`, `"low"`, `"high"`)                                      |
| `authorization`          | OAuth provider configuration                                                                              |

### Step 2: Create API Helper

Create `lib/actions/mcp_internal_actions/servers/{provider}/{provider}_api_helper.ts`.

This file is a thin wrapper around the platform's REST API. It should:

- Define TypeScript interfaces for the API responses
- Export async functions for each API operation (e.g., `listItems`, `getItem`, `createItem`)
- Use `Result<T, Error>` return types from `@app/types` for consistent error handling
- Handle HTTP errors and return meaningful error messages
- Accept `accessToken` as the first parameter for OAuth-based APIs

**Key patterns:**

- Use `fetch` with proper headers (`Authorization: Bearer ${accessToken}`)
- Return `new Ok(data)` on success, `new Err(new Error(...))` on failure
- Keep functions focused on a single API endpoint

See `servers/jira/jira_api_helper.ts` or `servers/hubspot/hubspot_api_helper.ts` for complete examples.

### Step 3: Create Utility Functions (Optional)

Create `lib/actions/mcp_internal_actions/servers/{provider}/{provider}_utils.ts`.

This file contains helper functions shared across tools. The most important pattern is the `withAuth` helper that:

- Extracts the OAuth access token from `authInfo`
- Returns a proper error if the token is missing
- Wraps the tool action in try/catch for consistent error handling

You can also define:

- Error message constants for common errors
- Response formatting helpers
- Data transformation utilities

See `servers/hubspot/hubspot_utils.ts` for a reference implementation.

### Step 4: Create Server Implementation

Create `lib/actions/mcp_internal_actions/servers/{provider}/index.ts`.

This is the main file that defines the MCP server and its tools. It should:

1. **Export a default function** that creates and returns the McpServer
2. **Use `makeInternalMCPServer("your_provider")`** to create the server instance
3. **Register tools using `server.tool()`** with:
   - Tool name (must match the key in `tools_stakes`)
   - Description (clear, actionable, explains what the tool does)
   - Zod schema for input parameters (with `.describe()` for each field)
   - Async handler function that calls API helpers and returns results

**Tool handler pattern:**

- Use the `withAuth` wrapper for OAuth-protected tools
- Call API helper functions
- Return `{ isError: boolean, content: [{ type: "text", text: "..." }] }`
- Provide a summary message first, then the data

See `servers/jira/index.ts` or `servers/notion.ts` for complete examples with multiple tools.

### Step 5: Register Server in Index

Edit `lib/actions/mcp_internal_actions/servers/index.ts`:

1. **Add import** at the top of the file
2. **Add a case** in the `getInternalMCPServer` switch statement

The switch statement must be exhaustive - TypeScript will error if you add the server name to constants but forget to add the case here.

### Step 6: Icon

For the icon, use an existing similar icon temporarily (e.g., `ActionDocumentTextIcon` or a similar provider's logo).

**Important:** Request the final icon from a designer who will add it to the Sparkle design system. Once the icon is available in Sparkle, update the `icon` field in the server configuration.

---

## OAuth Implementation (If Needed)

If the platform requires OAuth and doesn't have an existing provider, you'll need to implement it in `core` first.

**Check existing providers:**

- `core/src/oauth/providers/` - Rust implementations (token exchange, refresh)
- `front/lib/api/oauth/providers/` - TypeScript implementations (authorization URL)

**What's needed:**

1. Create `core/src/oauth/providers/{provider}.rs` - Implements token exchange and refresh
2. Register in `core/src/oauth/providers/mod.rs`
3. Create `front/lib/api/oauth/providers/{provider}.ts` - Builds authorization URL
4. Register in `front/lib/api/oauth/providers/index.ts`
5. Add client ID/secret environment variables

See existing providers like `hubspot.rs`/`hubspot.ts` or `jira.rs`/`jira.ts` for reference.

**Note:** A dedicated OAuth runbook for `core` will be created separately with detailed implementation steps.

---

## Tool Stakes Guide

Configure tool stakes appropriately:

| Stake Level | When to Use                               | Example                                              |
| ----------- | ----------------------------------------- | ---------------------------------------------------- |
| `never_ask` | Read-only operations with no side effects | `list_items`, `get_item`, `search`                   |
| `low`       | Write operations with minimal impact      | `create_comment`, `add_tag`, `create_draft`          |
| `high`      | Destructive or high-impact operations     | `delete_item`, `send_email`, `update_critical_field` |

---

## Feature Flags and Restrictions

To gate a server behind a feature flag:

```typescript
your_provider: {
  // ...
  isRestricted: ({ featureFlags }) => {
    return !featureFlags.includes("your_provider_tool");
  },
  isPreview: true,
  // ...
}
```

To gate by plan:

```typescript
your_provider: {
  // ...
  isRestricted: ({ plan, featureFlags }) => {
    const isInPlan = plan.limits.connections.isYourProviderAllowed;
    const hasFeatureFlag = featureFlags.includes("your_provider_tool");
    return !(isInPlan || hasFeatureFlag);
  },
  // ...
}
```

---

## Best Practices

### 1. Error Handling

Always use Result types and provide meaningful error messages. Don't expose raw API errors to users - translate them into actionable messages.

### 2. Response Rendering (Important for Token Efficiency)

Always implement functions that convert the output from the API into a clean, focused, and Markdown-formatted text.
See `lib/actions/mcp_internal_actions/servers/zendesk/rendering.ts` for an example.
External APIs often return many fields that are irrelevant and hard to interpret for the agent.
The rendering serves two purposes: selecting the relevant fields and formatting them for the LLM.

**Do:**

- Select only the fields the LLM needs to complete its task
- Remove internal IDs, timestamps, and metadata unless specifically needed
- Start with a brief summary (e.g., "Found 5 items matching your query")
- Follow with the structured data
- Use consistent formats across similar tools

**Don't:**

- Return raw `JSON.stringify(apiResponse)` with all fields
- Include pagination metadata, rate limit info, or API versioning details
- Return the same data in multiple formats

### 3. Tool Descriptions

Write clear, actionable descriptions that help the LLM understand when to use each tool. Include:

- What the tool does
- What parameters are required vs. optional
- What the tool returns
- Any limitations or prerequisites

### 4. Input Validation

Use Zod schemas with `.describe()` for each parameter. This helps the LLM understand what values are expected and improves tool calling accuracy.

### 5. Validate External API Responses

Always validate data returned from external APIs using Zod schemas.
External APIs can change without notice, return unexpected data, or have undocumented edge cases.
Validation ensures your code fails fast with clear error messages rather than propagating malformed data.

**Pattern:**

```typescript
// In types.ts - define schemas for API responses
const ItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
}).passthrough(); // Use .passthrough() to allow extra fields from the API

const ItemResponseSchema = z.object({
  item: ItemSchema,
});

// In client.ts - validate every API response
private async request<T extends z.Schema>(
  endpoint: string,
  schema: T
): Promise<Result<z.infer<T>, Error>> {
  const response = await fetch(url, { ... });
  const rawData = await response.json();

  const parseResult = schema.safeParse(rawData);
  if (!parseResult.success) {
    logger.error(
      { endpoint, error: parseResult.error.message },
      "[Provider] Invalid API response format"
    );
    return new Err(
      new Error(`Invalid API response format: ${parseResult.error.message}`)
    );
  }

  return new Ok(parseResult.data);
}
```

**Benefits:**

- Catches API contract changes early
- Provides clear error messages for debugging
- Prevents runtime errors from unexpected data shapes
- Documents the expected API response structure

See `servers/zendesk/types.ts` and `servers/zendesk/client.ts` for a complete example.

---

## Reference Implementations

Study these existing implementations for patterns:

- **Simple OAuth integration**: `servers/hubspot/` - Shows basic OAuth with many CRUD operations
- **Complex API with pagination**: `servers/jira/` - GraphQL-like queries, pagination, transitions
- **Multiple auth use cases**: `servers/github/` - Platform and personal actions

---

## Validation Checklist

Before marking implementation complete:

- [ ] Server added to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`
- [ ] Server configuration added to `INTERNAL_MCP_SERVERS`
- [ ] Server registered in `servers/index.ts` switch statement
- [ ] API helper functions created with proper error handling
- [ ] All tools defined with appropriate stakes
- [ ] Response pruning implemented (only return the necessary fields)
- [ ] OAuth provider configured (if needed)
- [ ] Temporary icon set (request final icon from designer)
- [ ] Feature flag configured (if preview)
- [ ] Manual testing completed
- [ ] Documentation URL added (if public)

---

## Troubleshooting

### Server Not Appearing in Builder

- Check `availability` setting (should be `"manual"` for user-selectable)
- Check `isRestricted` function isn't blocking
- Verify server is in `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`

### OAuth Connection Failing

- Verify OAuth provider exists in both `core` and `front`
- Check client ID/secret environment variables are set
- Verify redirect URI is whitelisted in provider's app settings
- Check OAuth scopes include required permissions

### Tools Not Working

- Verify tool is registered in server
- Check `tools_stakes` includes the tool name
- Test API helper functions directly
- Check authInfo.token is being passed correctly

### Type Errors

- Ensure server name is added to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES` (affects type inference)
- Run `npm run type-check` to catch issues early

---

## Additional Resources

- [MCP SDK Documentation](https://modelcontextprotocol.io/)
- Existing server implementations in `lib/actions/mcp_internal_actions/servers/`
- OAuth provider implementations in `core/src/oauth/providers/`
