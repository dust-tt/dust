# MCP Server Runbook: Adding Internal MCP Server Integrations for Remote Platforms

This runbook provides step-by-step instructions for creating new internal MCP server integrations in Dust that connect to remote platforms (e.g., Jira, HubSpot, Salesforce, etc.).

---

## Quick Reference

### File Structure

```
front/lib/api/actions/servers/{provider}/
├── metadata.ts           # Tool metadata and server info using createToolsRecord
├── tools/index.ts        # Tool handlers with exhaustive Record type
├── index.ts              # Server creation and tool registration
├── client.ts             # API client (optional)
└── helpers.ts            # Helper functions (optional)
```

### Registration Files

1. `lib/actions/mcp_internal_actions/constants.ts` - Add server config with `metadata: YOUR_SERVER`
2. `lib/actions/mcp_internal_actions/servers/index.ts` - Import and register in switch statement

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

## Step-by-Step Implementation

### Step 1: Create Metadata File

Create `lib/api/actions/servers/{provider}/metadata.ts`:

```typescript
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const YOUR_PROVIDER_TOOL_NAME = "your_provider" as const;

// Tools metadata with exhaustive keys
// Adding a tool here without implementing its handler will cause a type error
export const YOUR_PROVIDER_TOOLS_METADATA = createToolsRecord({
  list_items: {
    description: "List all items accessible to the user.",
    schema: {
      pageToken: z.string().optional().describe("Page token for pagination."),
      maxResults: z.number().optional().describe("Maximum results to return."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Items",
      done: "List items",
    },
  },
  get_item: {
    description: "Get a single item by ID.",
    schema: {
      itemId: z.string().describe("The ID of the item to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving item",
      done: "Retrieve item",
    },
  },
  create_item: {
    description: "Create a new item.",
    schema: {
      name: z.string().describe("Name of the item."),
      description: z.string().optional().describe("Description of the item."),
    },
    stake: "low",
    displayLabels: {
      running: "Creating item",
      done: "Create item",
    },
  },
});

// Server metadata - used in constants.ts
export const YOUR_PROVIDER_SERVER = {
  serverInfo: {
    name: "your_provider",
    version: "1.0.0",
    description: "Short description of what this integration does.",
    authorization: {
      provider: "your_provider",
      supported_use_cases: ["personal_actions", "platform_actions"],
      // Optional: scope: "specific:scope",
    },
    icon: "YourProviderLogo",
    documentationUrl: "https://docs.dust.tt/docs/your-provider",
    instructions: null,
  },
  tools: Object.values(YOUR_PROVIDER_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(YOUR_PROVIDER_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
```

**Key points:**

- `createToolsRecord` automatically adds the `name` property from the object key
- Tool keys become the source of truth - no duplication
- `stake` values: `"never_ask"` (read), `"low"` (write), `"medium"` (important write), `"high"` (destructive)

### Step 2: Create Tool Handlers

Create `lib/api/actions/servers/{provider}/tools/index.ts`:

```typescript
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { YOUR_PROVIDER_TOOLS_METADATA } from "@app/lib/api/actions/servers/your_provider/metadata";
import { Err, Ok } from "@app/types/shared/result";

// Handlers object - TypeScript enforces exhaustivity via ToolHandlers<T>
// Missing a handler = compile error
const handlers: ToolHandlers<typeof YOUR_PROVIDER_TOOLS_METADATA> = {
  list_items: async ({ pageToken, maxResults }, { authInfo }) => {
    const token = authInfo?.token;
    if (!token) {
      return new Err(new MCPError("No access token provided"));
    }

    try {
      // Call your API
      const items = []; // await yourApiClient.listItems(token, { pageToken, maxResults });

      return new Ok([
        { type: "text" as const, text: `Found ${items.length} items` },
        { type: "text" as const, text: JSON.stringify({ items }, null, 2) },
      ]);
    } catch (e) {
      return new Err(new MCPError("Failed to list items"));
    }
  },

  get_item: async ({ itemId }, { authInfo }) => {
    const token = authInfo?.token;
    if (!token) {
      return new Err(new MCPError("No access token provided"));
    }

    try {
      // Call your API
      const item = {}; // await yourApiClient.getItem(token, itemId);

      return new Ok([
        { type: "text" as const, text: `Retrieved item ${itemId}` },
        { type: "text" as const, text: JSON.stringify(item, null, 2) },
      ]);
    } catch (e) {
      return new Err(new MCPError("Failed to get item"));
    }
  },

  create_item: async ({ name, description }, { authInfo }) => {
    const token = authInfo?.token;
    if (!token) {
      return new Err(new MCPError("No access token provided"));
    }

    try {
      // Call your API
      const item = {}; // await yourApiClient.createItem(token, { name, description });

      return new Ok([
        { type: "text" as const, text: `Created item "${name}"` },
        { type: "text" as const, text: JSON.stringify(item, null, 2) },
      ]);
    } catch (e) {
      return new Err(new MCPError("Failed to create item"));
    }
  },
};

// Export tools array using buildTools helper
export const TOOLS = buildTools(YOUR_PROVIDER_TOOLS_METADATA, handlers);
```

**Key points:**

- `ToolHandlers<T>` generic type enforces exhaustivity - defined in `tool_definition.ts`
- `buildTools` helper combines metadata and handlers into a `ToolDefinition[]` array
- If you add a tool to metadata without a handler, you get: `Property 'new_tool' is missing in type '...'`
- Each handler receives typed params inferred from the tool's schema
- Access auth token via `extra.authInfo?.token`

### Step 3: Create Server Entry Point

Create `lib/api/actions/servers/{provider}/index.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { YOUR_PROVIDER_TOOL_NAME } from "@app/lib/api/actions/servers/your_provider/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/your_provider/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("your_provider");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: YOUR_PROVIDER_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;
```

### Step 4: Register in Constants

Edit `lib/actions/mcp_internal_actions/constants.ts`:

```typescript
// Add import at the top
import { YOUR_PROVIDER_SERVER } from "@app/lib/api/actions/servers/your_provider/metadata";

// Add to AVAILABLE_INTERNAL_MCP_SERVER_NAMES array
export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // ... existing servers
  "your_provider",
  // ...
] as const;

// Add to INTERNAL_MCP_SERVERS object
export const INTERNAL_MCP_SERVERS = {
  // ... existing servers

  your_provider: {
    id: 99, // Use unique ID - check existing IDs
    availability: "manual",
    allowMultipleInstances: true, // true for OAuth-based
    isRestricted: undefined,
    isPreview: false,
    tools_arguments_requiring_approval: undefined,
    tools_retry_policies: undefined,
    timeoutMs: undefined,
    metadata: YOUR_PROVIDER_SERVER, // <-- Use the metadata export
  },

  // ...
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

### Step 5: Register Server in Index

Edit `lib/actions/mcp_internal_actions/servers/index.ts`:

```typescript
// Add import
import { default as yourProviderServer } from "@app/lib/api/actions/servers/your_provider";

// Add case in getInternalMCPServer switch
case "your_provider":
  return yourProviderServer(auth, agentLoopContext);
```

---

## Optional: API Client and Helpers

For servers that call external APIs, consider creating additional files to keep your code organized.

### `client.ts` - API Client

Create when you have multiple API endpoints to call. This file handles:

- Authentication headers (Bearer token from OAuth)
- Request/response handling with proper error normalization
- Response validation with Zod schemas
- Rate limiting and retry logic (if needed)

```typescript
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export class YourProviderClient {
  constructor(private accessToken: string) {}

  async getItem(itemId: string): Promise<Result<Item, Error>> {
    const response = await fetch(`https://api.provider.com/items/${itemId}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return new Err(new Error(`Failed to get item: ${response.statusText}`));
    }

    const data = await response.json();
    return new Ok(data);
  }
}
```

### `helpers.ts` - Helper Functions

Create for shared logic across tools:

- The `withAuth` pattern for OAuth token extraction and error handling
- Response formatting functions for LLM consumption
- Data transformation utilities

```typescript
import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err } from "@app/types/shared/result";

// withAuth pattern - extracts token and provides consistent error handling
export async function withAuth<T>(
  { authInfo }: ToolHandlerExtra,
  action: (token: string) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const token = authInfo?.token;
  if (!token) {
    return new Err(new MCPError("No access token provided"));
  }

  try {
    return await action(token);
  } catch (e) {
    return new Err(
      new MCPError(`Operation failed: ${normalizeError(e).message}`)
    );
  }
}

// Response formatting for consistent LLM output
export function formatItemAsText(item: Item): string {
  return [
    `**${item.name}**`,
    `ID: ${item.id}`,
    `Status: ${item.status}`,
    item.description ? `Description: ${item.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
```

**When to use these patterns:**

| Scenario                         | Recommendation                                               |
| -------------------------------- | ------------------------------------------------------------ |
| No external API (internal tools) | Skip client/helpers, keep logic in `tools/index.ts`          |
| 1-2 simple API calls             | Inline in handlers, maybe add `helpers.ts` for `withAuth`    |
| Multiple API endpoints           | Create `client.ts` with a class, `helpers.ts` for formatting |
| Complex response formatting      | Create dedicated `rendering.ts` (see `zendesk/rendering.ts`) |

See `google_calendar/helpers.ts` and `github/tools/index.ts` for reference implementations.

---

## Alternative: Function-Based Tools (When Auth is Needed in Closure)

If your handlers need access to `Authenticator` directly (not just the token), use a function instead of a constant:

```typescript
// In tools/index.ts
export function createYourProviderTools(auth: Authenticator): ToolDefinition[] {
  const handlers: ToolHandlers<typeof YOUR_PROVIDER_TOOLS_METADATA> = {
    some_tool: async (params, extra) => {
      // Can use `auth` here from closure
      const workspace = auth.getNonNullableWorkspace();
      // ...
    },
  };

  return buildTools(YOUR_PROVIDER_TOOLS_METADATA, handlers);
}

// In index.ts
const tools = createYourProviderTools(auth);
for (const tool of tools) {
  registerTool(auth, agentLoopContext, server, tool, {
    monitoringName: YOUR_PROVIDER_TOOL_NAME,
  });
}
```

See `lib/api/actions/servers/github/tools/index.ts` for a complete example.

---

## Icon

For the icon, use an existing similar icon temporarily (e.g., `ActionDocumentTextIcon` or a similar provider's logo).

**Important:** Request the final icon from a designer who will add it to the Sparkle design system. Once the icon is available in Sparkle, update the `icon` field in the server configuration.

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

### 1. Response Rendering (Important for Token Efficiency)

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

### 2. Error Handling

Always return `Err` with meaningful messages. Don't expose raw API errors to users - translate them into actionable messages:

```typescript
try {
  // API call
} catch (e) {
  return new Err(
    new MCPError(`Failed to create item: ${normalizeError(e).message}`)
  );
}
```

### 3. Tool Stakes

| Stake       | Use Case                                  |
| ----------- | ----------------------------------------- |
| `never_ask` | Read-only operations with no side effects |
| `low`       | Write operations with minimal impact      |
| `medium`    | Important writes (create, update)         |
| `high`      | Destructive or high-impact operations     |

### 4. Schema Descriptions

Always add `.describe()` to schema fields - this helps the LLM understand what values to provide:

```typescript
schema: {
  query: z.string().describe("Search query to find items by name or description."),
  limit: z.number().optional().describe("Maximum number of results (default: 50, max: 100)."),
}
```

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

## Validation Checklist

Before marking implementation complete:

- [ ] `metadata.ts` created with `createToolsRecord`
- [ ] `tools/index.ts` created with `ToolHandlers<typeof METADATA>`
- [ ] `index.ts` created with `createServer` default export
- [ ] Server added to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`
- [ ] Server config added to `INTERNAL_MCP_SERVERS` with `metadata` field
- [ ] Server registered in `servers/index.ts` switch statement
- [ ] Response rendering implemented (only return necessary fields)
- [ ] Temporary icon set (request final icon from designer)
- [ ] Feature flag configured (if preview)
- [ ] Type check passes (`npx tsgo --noEmit`)
- [ ] Lint passes (`npm run lint`)
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
- Check `tools_stakes` includes the tool name (if not using `metadata`)
- Test API helper functions directly
- Check authInfo.token is being passed correctly

### Type Errors

- Ensure server name is added to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES` (affects type inference)
- Run `npx tsgo --noEmit` to catch issues early
- If handler type is wrong, check the mapped type definition matches metadata

---

## Reference Implementations

- **GitHub**: `lib/api/actions/servers/github/` - Function-based tools with auth closure
- **Snowflake**: `lib/api/actions/servers/snowflake/` - Constant tools with token from authInfo
- **Google Calendar**: `lib/api/actions/servers/google_calendar/` - Complex tools with helpers
- **Agent Copilot Context**: `lib/api/actions/servers/agent_copilot_context/` - Internal tools without OAuth
- **Agent Copilot Agent State**: `lib/api/actions/servers/agent_copilot_agent_state/` - Simple internal server

---

## Additional Resources

- [MCP SDK Documentation](https://modelcontextprotocol.io/)
- Existing server implementations in `lib/api/actions/servers/`
- Legacy server implementations in `lib/actions/mcp_internal_actions/servers/`
- OAuth provider implementations in `core/src/oauth/providers/`
