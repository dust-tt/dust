---
name: dust-mcp-server
description: Step-by-step guide for creating new internal MCP server integrations in Dust that connect to remote platforms (Jira, HubSpot, Salesforce, etc.). Use when adding a new MCP server, implementing a platform integration, or connecting Dust to a new external service.
---

# MCP Server Runbook: Adding Internal MCP Server Integrations for Remote Platforms

This runbook provides step-by-step instructions for creating new internal MCP server integrations in Dust that connect to remote platforms (e.g., Jira, HubSpot, Salesforce, etc.).

## Quick Reference

### File Structure

```text
front/lib/api/actions/servers/{provider}/
├── metadata.ts           # Tool metadata and server info using createToolsRecord
├── tools/index.ts        # Tool handlers with exhaustive Record type
├── index.ts              # Server creation and tool registration
├── client.ts             # API client (optional)
└── helpers.ts            # Helper functions (optional)
```

### Registration Files

1. `front/lib/actions/mcp_internal_actions/constants.ts` - Add server config with `metadata: YOUR_SERVER`
2. `front/lib/actions/mcp_internal_actions/servers/index.ts` - Import and register in switch statement

### OAuth Requirements (if the platform requires OAuth)

- OAuth provider must already exist in `front/lib/api/oauth/providers/{provider}.ts`
- OAuth core implementation must exist in `core/src/oauth/providers/{provider}.rs`
- OAuth scopes must be configured for the required API access
- Server's `authorization` field must reference the OAuth provider

### Common Gotchas

- Do not forget to add the server to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES` array
- Server IDs must be stable and unique; never change them once deployed
- Tool stakes must be configured appropriately (`never_ask`, `low`, `medium`, `high`)
- Always implement proper error handling with `Result` types
- Handle OAuth token refresh automatically through the `withAuth` pattern

## Prerequisites

### OAuth Configuration (if required)

If the remote platform requires OAuth authentication:

1. Check whether an OAuth provider exists in `core/src/oauth/providers/` as `{provider}.rs`
2. Check whether a front OAuth provider exists in `front/lib/api/oauth/providers/{provider}.ts`

If the OAuth provider does not exist, implement it first in `core` and `front`:

- create `core/src/oauth/providers/{provider}.rs`
- implement the OAuth flow: authorization URL, token exchange, refresh
- register the provider in `core/src/oauth/providers/mod.rs`
- create `front/lib/api/oauth/providers/{provider}.ts` for the front-end OAuth setup

See existing providers like `hubspot.rs` or `jira.rs` for reference implementations.

### Research Phase

Before starting implementation, research the platform API:

#### 1. API Documentation

- find the official API documentation
- identify REST endpoints vs GraphQL vs SDK usage
- note rate limits and pagination requirements

#### 2. Authentication Method

- OAuth 2.0, preferred for user-facing integrations
- API key / bearer token, simpler but less secure
- required OAuth scopes

#### 3. Available Operations

Document the operations you want to expose:

- read operations: list, get, search
- write operations: create, update, delete
- special operations: transitions, associations, etc.

## Step-by-Step Implementation

### 1. Create `metadata.ts`

Create `front/lib/api/actions/servers/{provider}/metadata.ts`:

```typescript
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

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

export const YOUR_PROVIDER_SERVER = {
  serverInfo: {
    name: "your_provider",
    version: "1.0.0",
    description: "Short description of what this integration does.",
    authorization: {
      provider: "your_provider",
      supported_use_cases: ["personal_actions", "platform_actions"],
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

Key points:

- `createToolsRecord` automatically adds the `name` property from the object key
- tool keys become the source of truth
- `stake` values map to review/approval expectations

### 2. Create `tools/index.ts`

Create `front/lib/api/actions/servers/{provider}/tools/index.ts`:

```typescript
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { YOUR_PROVIDER_TOOLS_METADATA } from "@app/lib/api/actions/servers/your_provider/metadata";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof YOUR_PROVIDER_TOOLS_METADATA> = {
  list_items: async ({ pageToken, maxResults }, { authInfo }) => {
    const token = authInfo?.token;
    if (!token) {
      return new Err(new MCPError("No access token provided"));
    }

    try {
      const items = [];

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
      const item = {};

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
      const item = {};

      return new Ok([
        { type: "text" as const, text: `Created item "${name}"` },
        { type: "text" as const, text: JSON.stringify(item, null, 2) },
      ]);
    } catch (e) {
      return new Err(new MCPError("Failed to create item"));
    }
  },
};

export const TOOLS = buildTools(YOUR_PROVIDER_TOOLS_METADATA, handlers);
```

Key points:

- `ToolHandlers<T>` enforces exhaustive implementation
- `buildTools` combines metadata and handlers into `ToolDefinition[]`
- each handler receives typed params inferred from the schema
- access the OAuth token via `extra.authInfo?.token`

### 3. Create `index.ts`

Create `front/lib/api/actions/servers/{provider}/index.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { TOOLS } from "@app/lib/api/actions/servers/your_provider/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("your_provider");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: "your_provider",
    });
  }

  return server;
}

export default createServer;
```

### 4. Register in `constants.ts`

Edit `front/lib/actions/mcp_internal_actions/constants.ts`:

- import `YOUR_PROVIDER_SERVER`
- add the server name to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`
- add the config entry to `INTERNAL_MCP_SERVERS`

Example:

```typescript
your_provider: {
  id: 99,
  availability: "manual",
  allowMultipleInstances: true,
  isRestricted: undefined,
  isPreview: false,
  tools_arguments_requiring_approval: undefined,
  tools_retry_policies: undefined,
  timeoutMs: undefined,
  metadata: YOUR_PROVIDER_SERVER,
},
```

Important properties:

- `id`: unique stable ID, never change after deployment
- `availability`: `manual`, `auto`, or `auto_hidden_builder`
- `allowMultipleInstances`: `true` for OAuth-based integrations
- `isRestricted`: feature-flag or plan gating function, if needed
- `isPreview`: `true` for beta or preview integrations

### 5. Register in `servers/index.ts`

Edit `front/lib/actions/mcp_internal_actions/servers/index.ts`:

```typescript
case "your_provider":
  return yourProviderServer(auth, agentLoopContext);
```

## Optional: `client.ts` and `helpers.ts`

Use extra files when the integration grows beyond a few simple calls.

### `client.ts`

Create a client when you need multiple API endpoints, response validation, auth header management,
or retry logic.

### `helpers.ts`

Create helpers for:

- `withAuth` wrappers
- response rendering
- shared data transformations

Example `withAuth` pattern:

```typescript
import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err } from "@app/types/shared/result";

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
    return new Err(new MCPError("Operation failed"));
  }
}
```

Use `client.ts` / `helpers.ts` based on complexity:

- no external API: keep everything in `tools/index.ts`
- 1-2 simple API calls: inline, maybe add `helpers.ts`
- several API endpoints: create `client.ts`
- complex response formatting: add dedicated rendering helpers

## Alternative: function-based tools

If handlers need access to `Authenticator` directly, create tools through a function instead of a
constant.

See `front/lib/api/actions/servers/github/tools/index.ts` for a full example.

## Icon

Use an existing similar icon temporarily, then request the final icon from design/Sparkle and
update the `icon` field once available.

## Feature Flags and Restrictions

Gate preview or limited-access servers through `isRestricted` in the server config, using feature
flags or plan checks as needed.

## Best Practices

### 1. Render responses for token efficiency

Always convert API responses into focused, markdown-formatted output. Avoid returning raw
`JSON.stringify(apiResponse)` with everything the upstream API sent.

Do:

- keep only the fields the model needs
- start with a short summary
- format structured results consistently

Do not:

- return full raw API responses
- include pagination metadata or rate-limit details unless needed
- duplicate the same data in multiple formats

### 2. Translate errors into actionable messages

Wrap failures in meaningful `MCPError`s rather than exposing raw upstream errors.

### 3. Choose tool stakes carefully

- `never_ask`: read-only operations
- `low`: low-impact writes
- `medium`: important writes
- `high`: destructive or high-impact actions

### 4. Add `.describe()` to schema fields

Schema descriptions help the model supply the right parameters.

### 5. Validate external API responses with Zod

Validate every external response to catch API drift and unexpected payloads early.

## Validation Checklist

Before marking implementation complete:

- `metadata.ts` exists and uses `createToolsRecord`
- `tools/index.ts` exists and uses `ToolHandlers<typeof METADATA>`
- `index.ts` default-exports the server factory
- the server is in `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`
- the server config is in `INTERNAL_MCP_SERVERS`
- the server is registered in `servers/index.ts`
- response rendering is implemented
- a temporary icon is set
- feature gating is configured if needed
- `npx tsgo --noEmit` passes
- `npm run format:changed` passes from the repo root
- manual testing is complete

## Troubleshooting

### Server not appearing in the builder

- check `availability`
- check `isRestricted`
- verify the server name is in `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`

### OAuth connection failing

- verify the provider exists in `core` and `front`
- check client ID / secret env vars
- verify redirect URIs and scopes

### Tools not working

- verify the tool is registered
- verify `tools_stakes` contains the tool names
- test the API helper functions directly
- confirm `authInfo.token` is propagated

### Type errors

- ensure the server name was added to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`
- run `npx tsgo --noEmit`
- if handler typing fails, re-check the metadata/handler mapping

## Reference Implementations

- `front/lib/api/actions/servers/github/`
- `front/lib/api/actions/servers/snowflake/`
- `front/lib/api/actions/servers/google_calendar/`
- `front/lib/api/actions/servers/agent_sidekick_context/`
- `front/lib/api/actions/servers/agent_sidekick_agent_state/`

## Additional Resources

- MCP SDK documentation: https://modelcontextprotocol.io/
- existing server implementations in `front/lib/api/actions/servers/`
- legacy implementations in `front/lib/actions/mcp_internal_actions/servers/`
- OAuth providers in `core/src/oauth/providers/`
