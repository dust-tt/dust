---
name: dust-mcp-server
description: Step-by-step guide for creating new internal MCP server integrations in Dust that connect to remote platforms (Jira, HubSpot, Salesforce, etc.). Use when adding a new MCP server, implementing a platform integration, or connecting Dust to a new external service.
---

# MCP Server Runbook: Adding Internal MCP Server Integrations for Remote Platforms

This runbook provides step-by-step instructions for creating new internal MCP server integrations in Dust that connect to remote platforms (e.g., Jira, HubSpot, Salesforce, etc.).

## MVP Fast Path

For a minimal new server (no OAuth, no external API yet — just the skeleton to register and test):

1. Create `front/lib/api/actions/servers/{provider}/metadata.ts` with a literal array of tool metadata
2. Create `front/lib/api/actions/servers/{provider}/tools/index.ts` with a server-qualified handler map
3. Register the server metadata in `constants.ts`
4. Wire the handler map to the shared `createServer` path in `servers/index.ts`
5. Add the server to `bm25_tool_search_utils.test.ts` with at least one BM25 query case in `bm25_tool_search.test.ts`

See the **BM25 Tests** section below for the test setup. This gives you a runnable skeleton
with type-checked tool descriptions before writing any real API calls.

## Quick Reference

### File Structure

```text
front/lib/api/actions/servers/{provider}/
├── metadata.ts           # Tool metadata and server info
├── tools/index.ts        # Exhaustive, typed tool handler map
├── client.ts             # API client (optional)
└── helpers.ts            # Helper functions (optional)
```

### Registration Files

1. `front/lib/actions/mcp_internal_actions/constants.ts` - Register `metadata: YOUR_PROVIDER_SERVER`
2. `front/lib/actions/mcp_internal_actions/servers/index.ts` - Import the handler map and pass it to `createServer`

### OAuth Requirements (if the platform requires OAuth)

- OAuth provider must already exist in `front/lib/api/oauth/providers/{provider}.ts`
- OAuth core implementation must exist in `core/src/oauth/providers/{provider}.rs`
- OAuth scopes must be configured for the required API access
- Server's `authorization` field must reference the OAuth provider

### Common Gotchas

- Do not forget to add the server to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES` array
- Server IDs must be stable and unique; never change them once deployed
- Define tools as an array; do not add a helper whose only job is to attach names or convert the array
- Give each tool an explicit, stable `name`
- Internal tools must define `displayLabels`, `stake`, `toolCostCategory`, and `freeUsage`
- Export a searchable server-qualified handler map such as `YOUR_PROVIDER_TOOL_HANDLERS`
- Monitoring defaults to the server name; use `monitoringName: "tool"` only when metrics must be split by tool name
- Tool stakes must be configured appropriately (`never_ask`, `low`, `medium`, `high`)
- Tool descriptions should start with a bare infinitive/base verb like `List`, `Get`, `Search`,
  `Create`, or `Update`
- Always implement proper error handling with `Result` types
- Add a `withAuth` helper only when token validation or client construction is genuinely repeated

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
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const YOUR_PROVIDER_TOOLS_METADATA = [
  {
    name: "list_items",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_item",
    description: "Get a single item by ID.",
    schema: {
      itemId: z.string().describe("The ID of the item to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving item",
      done: "Retrieve item",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_item",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

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
  tools: YOUR_PROVIDER_TOOLS_METADATA,
} as const satisfies ServerMetadata;
```

Key points:

- the metadata is a plain array and each tool declares its own `name`
- pass that same array directly to `YOUR_PROVIDER_SERVER.tools`; JSON-schema conversion happens centrally
- keep `as const` so tool names and Zod schemas remain precise enough for `ToolHandlers<typeof ...>`
- tool descriptions start with a bare infinitive/base verb such as `List`, `Get`, `Search`,
  `Create`, `Update`, or `Retrieve`; avoid noun phrases, articles, gerunds, and third-person
  verbs because descriptions are part of the BM25 tool-search corpus (see **BM25-Friendly
  Descriptions** below)
- `stake` controls review/approval expectations
- `toolCostCategory` and `freeUsage` control credit accounting

### BM25-Friendly Descriptions (MCP3 rule)

Tool names and descriptions both drive BM25 retrieval. **Names are the strongest signal** — they
must be consistent and follow the `verb_noun` convention (e.g., `list_warehouses`, `get_workbook`).
Descriptions are the secondary signal: write each one as if answering "what user intent does this
tool serve?"

**Rules:**

1. Start with a bare infinitive verb: `List`, `Get`, `Search`, `Create`, `Update`, `Send`, `Delete`
2. Include platform-specific nouns that users mention in queries: `warehouse`, `workbook`, `ticket`, `channel`
3. Include common synonyms inline when the platform uses an unusual term: `worksheets (sheets/tabs)`
4. Include the platform name when it adds specificity (e.g., `Databricks workspace`, `Excel workbook`),
   but don't lead with the full brand name or repeat it redundantly across every tool
5. For platform-specific servers, avoid adding location qualifiers (e.g., `in OneDrive`,
   `in SharePoint`) to every tool — BM25 treats these as content tokens, so they widen the match
   surface and cause your tools to surface on location-based queries (e.g., a Drive search) even
   when the user intended a different tool

**Examples:**

```typescript
// BAD — noun phrase, redundant "Microsoft Excel", location noise
description: "Microsoft Excel file listing from OneDrive and SharePoint."

// BAD — gerund
description: "Listing all SQL warehouses in Databricks."

// BAD — third-person verb
description: "Lists all SQL warehouses available in Databricks."

// GOOD — bare infinitive, platform noun, no location noise
description: "List all SQL warehouses available in the Databricks workspace."

// GOOD — synonym in parentheses helps BM25 match "sheets" and "tabs"
description: "Get a list of all worksheets (sheets/tabs) in an Excel workbook."

// GOOD — verb + context + common synonyms
description: "Search Slack channels, messages, and threads by keyword or topic."
```

**Test your descriptions:** add a BM25 query case (see next section) before merging. If your
expected tool doesn't score > 0 in its own server-scoped index, the description is too generic
or missing the key tokens the user will type.

### 2. Create `tools/index.ts`

Create `front/lib/api/actions/servers/{provider}/tools/index.ts`:

```typescript
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { YOUR_PROVIDER_TOOLS_METADATA } from "@app/lib/api/actions/servers/your_provider/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const YOUR_PROVIDER_TOOL_HANDLERS: ToolHandlers<
  typeof YOUR_PROVIDER_TOOLS_METADATA
> = {
  list_items: async ({ pageToken, maxResults }, { authInfo }) => {
    const token = authInfo?.token;
    if (!token) {
      return new Err(new MCPError("No access token provided"));
    }

    try {
      const items = [];

      return new Ok([
        {
          type: "text" as const,
          text: `Found ${items.length} items\n\n${JSON.stringify(items, null, 2)}`,
        },
      ]);
    } catch (e) {
      return new Err(
        new MCPError(`Failed to list items: ${normalizeError(e).message}`)
      );
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
      return new Err(
        new MCPError(`Failed to get item: ${normalizeError(e).message}`)
      );
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
      return new Err(
        new MCPError(`Failed to create item: ${normalizeError(e).message}`)
      );
    }
  },
};
```

Key points:

- `ToolHandlers<T>` enforces exhaustive implementation
- each handler receives typed params inferred from the schema
- the second argument exposes request context such as `auth`, `authInfo`, and `runContext`
- access the OAuth token via `authInfo?.token`; do not close over request state when `ToolHandlerExtra` already provides it
- consistently use a server-qualified export name rather than a generic `TOOL_HANDLERS` export

### 3. Register in `constants.ts`

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
- `requiresBearerToken`: set this when the server authenticates with a bearer token
- `tools_arguments_requiring_approval`: optionally identify sensitive arguments that require review
- `tools_retry_policies`: configure retries only when the tool semantics support them

### 4. Wire the handler map in `servers/index.ts`

Import the handler map and add a case to `getInternalMCPServer` that uses the central server factory:

```typescript
import { YOUR_PROVIDER_TOOL_HANDLERS } from "@app/lib/api/actions/servers/your_provider/tools";

case "your_provider":
  return createServer(auth, {
    serverMetadata: INTERNAL_MCP_SERVERS[internalMCPServerName].metadata,
    toolHandlers: YOUR_PROVIDER_TOOL_HANDLERS,
    toolContext,
  });
```

Do not create a provider-level `index.ts` or server factory whose only job is to merge metadata and
handlers. The shared `createServer` path already registers the Zod schemas, applies tool availability,
and links each metadata entry to its handler. It monitors all tools under `serverInfo.name` by
default. Pass `monitoringName: "tool"` only for servers that intentionally monitor each tool under
`tool.name`, such as `data_sources_file_system`.

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
import { normalizeError } from "@app/types/shared/utils/error_utils";

export async function withAuth(
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
```

Use `client.ts` / `helpers.ts` based on complexity:

- no external API: keep everything in `tools/index.ts`
- 1-2 simple API calls: inline, maybe add `helpers.ts`
- several API endpoints: create `client.ts`
- complex response formatting: add dedicated rendering helpers

## Context-dependent tools

### Prefer metadata availability callbacks

If a static tool should only be exposed for some users or run contexts, add
`isAvailableForContext` to its `ToolMeta`. The shared `createServer` implementation evaluates this
callback before registering the tool:

```typescript
{
  name: "contextual_tool",
  isAvailableForContext: ({
    auth,
    toolContext,
  }: {
    auth: Authenticator;
    toolContext?: ToolContext;
  }) => {
    return canUseContextualTool(auth, toolContext);
  },
  // description, schema, stake, displayLabels, toolCostCategory, freeUsage...
}
```

Keep the availability rule beside the tool metadata instead of scattering conditional callbacks
through server wiring. See `common_utilities/metadata.ts`, `conversation_files/metadata.ts`, and
`interactive_content/metadata.ts` for current examples. For a standalone `as const` metadata
array, type the callback context inline as above; do not widen the whole array to `ToolMeta[]`.

### Use factories only for genuinely dynamic construction

Most handlers do not need a factory: they receive `auth`, `authInfo`, and `runContext` through their
second argument. Keep a contextual factory only when the set of metadata or handlers itself must be
built from runtime state. Examples include fully dynamic tool definitions such as `extract_data`
and context-selected metadata variants such as `data_sources_file_system`.

Do not introduce a factory merely to combine a static metadata array with a static handler map.

## Icon

Use an existing similar icon temporarily, then request the final icon from design/Sparkle and
update the `icon` field once available.

When wiring up the icon:

1. Add the SVG to `sparkle/src/logo/platforms/` if it doesn't already exist, and re-export it
   from `sparkle/src/logo/platforms/index.ts`.
2. Always check `sparkle/src/logo/platforms/registry.ts` and add the logo to `PLATFORM_LOGOS`.
   The marketing site resolves icons by string name via `getPlatformLogo()`, so a missing
   registry entry silently falls back to a placeholder puzzle-piece on `/integrations`.
3. **Marketing must be redeployed for the new icon to appear on the public integrations page —
   explicitly tell the engineer.** The change lands in the sparkle bundle that marketing builds
   against, so a marketing rebuild is required.

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

## BM25 Tests

Every new server must be added to the BM25 test corpus. This is the only automated check that
description quality is sufficient for tool-search retrieval.

### 1. Register the server in `bm25_tool_search_utils.test.ts`

Add an import and a `SERVER_SOURCES` entry. The test utility derives `SERVERS` from this array:

```typescript
// At the top with the other imports:
import { YOUR_PROVIDER_SERVER } from "@app/lib/api/actions/servers/your_provider/metadata";

// In the SERVER_SOURCES array:
{ name: "your_provider", tools: YOUR_PROVIDER_SERVER.tools },
```

### 2. Add query cases in `bm25_tool_search.test.ts`

Add entries to the `QUERIES` array. Each entry needs:
- `query`: the natural-language phrase a user would type
- `expected`: `"<server_name>.<tool_name>"` — the tool that must score > 0

```typescript
{ query: "list databricks warehouses", expected: "databricks.list_warehouses" },
{ query: "what sql warehouses do I have", expected: "databricks.list_warehouses" },
```

**Tips for writing good query cases:**

- Use the vocabulary users actually type, not API jargon
- Cover at least one case per tool (two is better)
- If a query is ambiguous (multiple servers could match), add `maxRank: N` to relax the
  full-corpus ranking assertion
- The single-server test (`"${query}" → ${expected} is scored in ${serverName}-only index`)
  only checks `score > 0`, so focus on making sure the key tokens appear somewhere in the tool's
  `description` or `inputSchema`

### 3. Run the tests

```bash
cd front
NODE_ENV=test npm test -- ./lib/api/actions/servers/bm25_tool_search.test.ts
```

If a case fails with "Expected tool to have a non-zero score but it was not found", the query
tokens don't overlap with the tool's corpus tokens. Fix the description to include the missing
token, or rephrase the query to use a term that's actually in the description.

## Validation Checklist

Before marking implementation complete:

- `metadata.ts` exports a literal metadata array with explicit tool names
- each tool defines `schema`, `stake`, `displayLabels`, `toolCostCategory`, and `freeUsage`
- the server metadata references the tool array directly and satisfies `ServerMetadata`
- tool descriptions start with a bare infinitive/base verb
- `tools/index.ts` exists and uses `ToolHandlers<typeof METADATA>`
- the handler map has a server-qualified export name
- the server is in `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`
- the server config is in `INTERNAL_MCP_SERVERS`
- `getInternalMCPServer` passes the registered metadata and handler map to `createServer`
- context-dependent visibility uses `isAvailableForContext` when possible
- tests call the handler map directly rather than rebuilding or looking up tools by name
- direct handler tests provide post-Zod values, including defaults normally applied by MCP schema parsing
- response rendering is implemented
- a temporary icon is set
- the icon is present in `PLATFORM_LOGOS` in `sparkle/src/logo/platforms/registry.ts`
- the engineer has been told marketing needs a redeploy for the icon to appear publicly
- feature gating is configured if needed
- server added to `SERVER_SOURCES` in `bm25_tool_search_utils.test.ts`
- at least one query case per tool added to `bm25_tool_search.test.ts`
- `cd front && NODE_ENV=test npm test -- ./lib/api/actions/servers/bm25_tool_search.test.ts` passes
- `cd front && npx tsgo --noEmit` passes
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
- verify every tool metadata entry has a matching handler-map key
- verify every published tool includes `stake`, `displayLabels`, `toolCostCategory`, and `freeUsage`
- test the API helper functions directly
- confirm `authInfo.token` is propagated

### Type errors

- ensure the server name was added to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`
- run `npx tsgo --noEmit`
- preserve the metadata array with `as const`; annotating it as `ToolMeta[]` widens tool names and schemas
- if handler typing fails, re-check that `ToolHandlers<typeof YOUR_PROVIDER_TOOLS_METADATA>` uses the exact array
- if a handler is missing or extra, fix the handler map rather than adding a metadata-to-handler adapter

## Reference Implementations

- `front/lib/api/actions/servers/github/`
- `front/lib/api/actions/servers/snowflake/`
- `front/lib/api/actions/servers/google_calendar/`
- `front/lib/api/actions/servers/agent_sidekick_context/`
- `front/lib/api/actions/servers/agent_sidekick_agent_state/`
- `front/lib/actions/mcp_internal_actions/servers/index.ts` for central `createServer` wiring

## Additional Resources

- MCP SDK documentation: https://modelcontextprotocol.io/
- existing server implementations in `front/lib/api/actions/servers/`
- internal server registry and shared construction in `front/lib/actions/mcp_internal_actions/`
- OAuth providers in `core/src/oauth/providers/`
