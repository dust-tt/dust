# PostHog Native MCP Server Integration Plan for Dust

## Decision: Remote MCP vs Internal REST Server

### Option A: Remote MCP Server (Fastest)
Add PostHog's hosted MCP server as a default remote MCP entry in `front/lib/actions/mcp_internal_actions/remote_servers.ts`.
- Pros: Immediate access to all 27 tools, maintained by PostHog
- Cons: Less control over UX, depends on PostHog's SSE endpoint availability

### Option B: Internal REST Server (Curated) ← **RECOMMENDED**
Build a native Dust internal MCP server that calls PostHog's REST API directly, following the Statuspage/OpenAI Usage patterns.
- Pros: Curated tool set, Dust-native UX, better error handling, response rendering optimized for LLMs
- Cons: More implementation work, subset of tools

**This plan follows Option B.**

---

## Architecture

### Authentication: Secrets-based (like Statuspage)
- User provides PostHog Personal API Key via Dust's secret system
- Server reads secret from `toolConfig.secretName` (not a hardcoded name)
- Metadata sets `developerSecretSelection: "required"`

### Network: Use untrustedFetch
- All external API calls go through Dust's egress proxy
- Pattern: `untrustedFetch()` from `@app/lib/egress/server`

### Configuration via additionalConfiguration
Configurable inputs surfaced in the builder UI:

| Key | Type | Description |
|-----|------|-------------|
| `region` | enum: `"us"` \| `"eu"` | PostHog Cloud region |
| `api_base_url` | string (optional) | Custom URL for self-hosted PostHog |
| `default_project_id` | string (optional) | Default project ID (tools accept optional override) |

Configuration must be declared via configurable input schema patterns (see `input_configuration.ts`).

---

## MVP Tool Set (5 tools)

Remove `set_active_*` tools - there's no reliable cross-tool-call mutable state. Instead, use explicit `project_id` parameters with optional defaults.

### Core Tools

| Tool | Description | Stake | Notes |
|------|-------------|-------|-------|
| `list_projects` | List projects in the organization | `never_ask` | Returns project IDs for use in other tools |
| `run_hogql_query` | Execute a HogQL query | `low` | Takes HogQL (not natural language), with required time range and row limit |
| `list_insights` | List saved insights in a project | `never_ask` | With pagination |
| `get_insight` | Get a specific insight by ID | `never_ask` | Returns insight config and cached results |
| `list_errors` | List errors captured in the project | `never_ask` | With filtering by status/timeframe |

### Tool Design Notes

**`run_hogql_query`**:
- Takes HogQL as input (not natural language) - LLM generates the query
- Required `time_range` parameter (e.g., `-7d`, `-30d`) to prevent unbounded queries
- Hard `limit` on rows returned (default: 100, max: 1000)
- Stake is `low` (not `never_ask`) because HogQL provides arbitrary read access to analytics data
- Server instructions should include HogQL guidance and privacy reminders

**All tools accept**:
- `project_id?: string` - uses `default_project_id` from config if omitted

---

## Security & Privacy Considerations

HogQL queries provide effectively arbitrary read access to analytics data, which may include PII.

Mitigations:
1. **Prefer aggregates**: Default response rendering focuses on aggregate data, not raw event payloads
2. **Row limits**: Enforce hard limits on query results
3. **Required time bounds**: Queries must specify a time range
4. **Stake level**: `run_hogql_query` is `low` stake (requires action confirmation in some contexts)
5. **Server instructions**: Include guidance about privacy-conscious querying
6. **Consider URL redaction**: Similar to `PostHogTracker.tsx` stripping query params, consider redacting URLs in results

---

## File Structure

```
front/lib/api/actions/servers/posthog/
├── metadata.ts           # Tool metadata, server info, developerSecretSelection: "required"
├── tools/
│   └── index.ts          # Tool handlers using ToolHandlers<T> pattern
├── index.ts              # Server creation with registerTool loop
├── client.ts             # getPosthogClient() pattern, untrustedFetch
├── types.ts              # Zod schemas for API responses
└── rendering.ts          # Response formatting for LLM consumption
```

---

## Implementation Checklist

### 1. Create Server Files

**`metadata.ts`**:
```typescript
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const POSTHOG_TOOL_NAME = "posthog" as const;

export const POSTHOG_TOOLS_METADATA = createToolsRecord({
  list_projects: {
    description: "List all PostHog projects accessible with the configured API key.",
    schema: {},
    stake: "never_ask",
    displayLabels: { running: "Listing projects", done: "List projects" },
  },
  run_hogql_query: {
    description: "Execute a HogQL query against PostHog analytics data. " +
      "HogQL is PostHog's SQL dialect. Returns aggregated results.",
    schema: {
      project_id: z.string().optional().describe("Project ID. Uses default if omitted."),
      query: z.string().describe("HogQL query to execute."),
      time_range: z.string().describe("Time range, e.g., '-7d', '-30d', '-1h'."),
      limit: z.number().max(1000).default(100).describe("Max rows to return."),
    },
    stake: "low", // Arbitrary read access to analytics data
    displayLabels: { running: "Running query", done: "Run query" },
  },
  list_insights: {
    description: "List saved insights in a PostHog project.",
    schema: {
      project_id: z.string().optional().describe("Project ID. Uses default if omitted."),
      limit: z.number().max(100).default(50).describe("Max insights to return."),
    },
    stake: "never_ask",
    displayLabels: { running: "Listing insights", done: "List insights" },
  },
  get_insight: {
    description: "Get a specific insight by ID, including its configuration and cached results.",
    schema: {
      project_id: z.string().optional().describe("Project ID. Uses default if omitted."),
      insight_id: z.string().describe("The insight ID."),
    },
    stake: "never_ask",
    displayLabels: { running: "Getting insight", done: "Get insight" },
  },
  list_errors: {
    description: "List errors captured in a PostHog project.",
    schema: {
      project_id: z.string().optional().describe("Project ID. Uses default if omitted."),
      status: z.enum(["active", "resolved", "all"]).default("active").describe("Filter by status."),
      limit: z.number().max(100).default(50).describe("Max errors to return."),
    },
    stake: "never_ask",
    displayLabels: { running: "Listing errors", done: "List errors" },
  },
});

export const POSTHOG_SERVER = {
  serverInfo: {
    name: "posthog",
    version: "1.0.0",
    description: "Query PostHog analytics data using HogQL.",
    authorization: null,
    icon: "ActionPieChartIcon", // Use existing icon; request PostHog logo for Sparkle later
    documentationUrl: null,
    instructions: `PostHog analytics integration. Use HogQL (PostHog's SQL dialect) for queries.

Example HogQL queries:
- Page views by country: SELECT properties.$geoip_country_name as country, count() FROM events WHERE event = '$pageview' GROUP BY country
- Daily active users: SELECT toDate(timestamp) as day, count(distinct distinct_id) FROM events GROUP BY day

Privacy note: Avoid querying raw user data when aggregates suffice.`,
    developerSecretSelection: "required",
  },
  tools: Object.values(POSTHOG_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(POSTHOG_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
```

**`client.ts`** (following statuspage pattern):
```typescript
import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { decrypt, Err, Ok } from "@app/types";

export async function getPosthogClient(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<Result<PosthogClient, MCPError>> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
  if (
    !toolConfig ||
    !isLightServerSideMCPToolConfiguration(toolConfig) ||
    !toolConfig.secretName
  ) {
    return new Err(
      new MCPError(
        "PostHog API key not configured. Please configure a secret containing your PostHog API key in the agent settings.",
        { tracked: false }
      )
    );
  }

  const secret = await DustAppSecretModel.findOne({
    where: {
      name: toolConfig.secretName,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  const apiKey = secret
    ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
    : null;
  if (!apiKey) {
    return new Err(
      new MCPError(
        "PostHog API key not found in workspace secrets. Please check the secret configuration.",
        { tracked: false }
      )
    );
  }

  // Get region from additionalConfiguration
  const additionalConfig = toolConfig.additionalConfiguration || {};
  const region = (additionalConfig.region as string) || "us";
  const customBaseUrl = additionalConfig.api_base_url as string | undefined;

  const baseUrl = customBaseUrl || (region === "eu"
    ? "https://eu.posthog.com/api"
    : "https://app.posthog.com/api");

  return new Ok(new PosthogClient(apiKey, baseUrl));
}

export class PosthogClient {
  constructor(
    private apiKey: string,
    private baseUrl: string
  ) {}

  private async request<T extends z.Schema>(
    method: "GET" | "POST",
    endpoint: string,
    schema: T,
    data?: unknown
  ): Promise<Result<z.infer<T>, Error>> {
    const response = await untrustedFetch(
      `${this.baseUrl}/${endpoint}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: data && method === "POST" ? JSON.stringify(data) : undefined,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(`PostHog API error (${response.status}): ${errorText || response.statusText}`)
      );
    }

    const rawData = await response.json();
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error(
        { error: parseResult.error.message },
        "[PostHog] Invalid API response format"
      );
      return new Err(
        new Error(`Invalid PostHog API response format: ${parseResult.error.message}`)
      );
    }

    return new Ok(parseResult.data);
  }

  // API methods...
}
```

### 2. Register Server

**Add to `AVAILABLE_INTERNAL_MCP_SERVER_NAMES`** in `constants.ts`:
```typescript
export const AVAILABLE_INTERNAL_MCP_SERVER_NAMES = [
  // ... existing entries
  "posthog",
] as const;
```

**Add to `INTERNAL_MCP_SERVERS`** in `constants.ts`:
```typescript
import { POSTHOG_SERVER } from "@app/lib/api/actions/servers/posthog/metadata";

// In INTERNAL_MCP_SERVERS object:
posthog: {
  id: XX, // Next available ID (check existing max, currently ~50+)
  availability: "manual",
  allowMultipleInstances: false, // API key per workspace, not per-user OAuth
  isPreview: true,
  isRestricted: ({ featureFlags }) => {
    return !featureFlags.includes("posthog_mcp");
  },
  tools_arguments_requiring_approval: undefined,
  tools_retry_policies: undefined,
  timeoutMs: undefined,
  metadata: POSTHOG_SERVER,
},
```

**Add to `servers/index.ts`** switch statement:
```typescript
import { default as posthogServer } from "@app/lib/api/actions/servers/posthog";

// In getInternalMCPServer switch:
case "posthog":
  return posthogServer(auth, agentLoopContext);
```

### 3. Update Snapshot Test

Update `front/lib/actions/mcp_internal_actions/mcp_servers_metadata.test.ts` and regenerate its snapshot to include the new server.

### 4. Configurable Inputs for Region

Define the region enum in the input schema so the builder can render it. Follow patterns in `input_configuration.ts` and the test file for configurable enum inputs with `INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM`.

---

## PostHog API Reference

### Base URLs
- US Cloud: `https://app.posthog.com/api/`
- EU Cloud: `https://eu.posthog.com/api/`
- Self-hosted: `{custom_url}/api/`

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects/` | GET | List projects |
| `/api/projects/{id}/query/` | POST | Execute HogQL query |
| `/api/projects/{id}/insights/` | GET | List insights |
| `/api/projects/{id}/insights/{id}/` | GET | Get insight |
| `/api/projects/{id}/error_tracking/issue/` | GET | List errors |

### Authentication
```
Authorization: Bearer {personal_api_key}
```

---

## Phase 2 (Future)

After MVP validation:
- `get_error_details` - Detailed error information
- `list_dashboards` / `get_dashboard` - Dashboard management
- `create_insight` / `update_insight` - Insight CRUD (stake: `low`)
- `delete_insight` - Destructive (stake: `high`, not medium)

---

## NOT Including

- **LLM costs tool**: Dust already has `openai_usage` for LLM cost tracking. PostHog's LLM observability is for customer's own product, not Dust ops.
- **Feature flags tools**: Out of scope for analytics focus. Could be a separate integration.
- **`set_active_*` tools**: No persistent state between tool calls.
- **Natural language → HogQL conversion**: That's the LLM's job, not the tool's job.

---

## Open Items

1. **Icon**: Use `ActionPieChartIcon` for MVP. Request PostHog logo addition to Sparkle design system.
2. **Documentation URL**: Create docs page once feature is ready.
3. **Feature flag**: Gate behind `posthog_mcp` feature flag during preview.

---

## Sources

- [PostHog MCP Documentation](https://posthog.com/docs/model-context-protocol)
- [PostHog MCP GitHub](https://github.com/PostHog/mcp)
- [PostHog MCP Tools List](https://opentools.com/registry/posthog-mcp)
- [PostHog API Documentation](https://posthog.com/docs/api)
- [PulseMCP PostHog Server](https://www.pulsemcp.com/servers/posthog)
