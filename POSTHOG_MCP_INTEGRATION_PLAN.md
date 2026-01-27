# PostHog Native MCP Server Integration Plan for Dust

## Overview

This plan outlines how to integrate PostHog analytics natively into Dust as an internal MCP server, allowing Dust agents to query analytics data, manage insights/dashboards, track errors, and monitor LLM costs.

## Research Summary

### PostHog MCP Server
- **Official server**: [github.com/PostHog/mcp](https://github.com/PostHog/mcp) (moved to monorepo)
- **Hosted endpoint**: `https://mcp.posthog.com/sse` (US) or `https://eu.mcp.posthog.com/sse` (EU)
- **Total tools**: 27 tools across 7 categories
- **Authentication**: API key-based (no OAuth) - users create keys with "MCP Server" preset
- **Transport**: SSE for receiving, HTTP POST for sending
- **Query language**: HogQL (PostHog's SQL dialect)

### PostHog API
- **US endpoint**: `https://app.posthog.com/api/`
- **EU endpoint**: `https://eu.posthog.com/api/`
- **Auth header**: `Authorization: Bearer <personal_api_key>`
- **API docs**: https://posthog.com/docs/api

## Architecture Decision

### Authentication Method: Secrets-based
- User provides their PostHog Personal API Key as a Dust secret
- No OAuth flow needed (PostHog doesn't support OAuth for API access)
- API key created with "MCP Server" preset for appropriate permissions

### Region Configuration
- User selects US or EU region via `additionalConfiguration`
- Stored as `{ region: "us" | "eu" }` in server configuration
- Base URL constructed dynamically based on region

---

## Tools to Implement (Analytics-focused subset: ~15 tools)

### Category 1: Organizations & Projects (4 tools)
| Tool | Description | Stake |
|------|-------------|-------|
| `get_organizations` | List organizations the user has access to | never_ask |
| `set_active_organization` | Set the active organization for subsequent calls | never_ask |
| `get_projects` | List projects in the active organization | never_ask |
| `set_active_project` | Set the active project for subsequent calls | never_ask |

### Category 2: Insights/Analytics (6 tools)
| Tool | Description | Stake |
|------|-------------|-------|
| `get_sql_insight` | Query analytics using HogQL (PostHog's SQL) | never_ask |
| `get_all_insights` | List all insights in the project | never_ask |
| `get_insight` | Get a specific insight by ID | never_ask |
| `create_insight` | Save a query as a new insight | low |
| `update_insight` | Modify an existing insight | low |
| `delete_insight` | Remove an insight | medium |

### Category 3: Dashboards (5 tools)
| Tool | Description | Stake |
|------|-------------|-------|
| `get_all_dashboards` | List all dashboards in the project | never_ask |
| `get_dashboard` | Get a specific dashboard by ID | never_ask |
| `create_dashboard` | Create a new dashboard | low |
| `update_dashboard` | Modify dashboard properties | low |
| `add_insight_to_dashboard` | Add an insight to a dashboard | low |

### Category 4: Error Tracking (2 tools)
| Tool | Description | Stake |
|------|-------------|-------|
| `list_errors` | List errors captured in the project | never_ask |
| `get_error_details` | Get detailed information about a specific error | never_ask |

### Category 5: LLM Observability (1 tool)
| Tool | Description | Stake |
|------|-------------|-------|
| `get_llm_costs` | Get LLM usage costs breakdown by model | never_ask |

---

## Implementation Plan

### File Structure
```
front/lib/api/actions/servers/posthog/
├── metadata.ts           # Tool metadata and server info
├── tools/
│   ├── index.ts          # Tool handlers
│   ├── organizations.ts  # Org/project tools
│   ├── insights.ts       # Insights/analytics tools
│   ├── dashboards.ts     # Dashboard tools
│   ├── errors.ts         # Error tracking tools
│   └── llm.ts            # LLM observability tools
├── index.ts              # Server creation
├── client.ts             # PostHog API client
├── types.ts              # Zod schemas for API responses
└── rendering.ts          # Response formatting for LLM
```

### Step 1: Create Types and API Client

**`types.ts`** - Define Zod schemas for PostHog API responses:
```typescript
// Organization, Project, Insight, Dashboard, Error schemas
// HogQL query/response schemas
```

**`client.ts`** - PostHog API client:
```typescript
class PostHogClient {
  constructor(
    private apiKey: string,
    private region: "us" | "eu"
  ) {}

  private get baseUrl() {
    return this.region === "eu"
      ? "https://eu.posthog.com/api"
      : "https://app.posthog.com/api";
  }

  // API methods for each endpoint
}
```

### Step 2: Create Metadata

**`metadata.ts`**:
```typescript
export const POSTHOG_TOOL_NAME = "posthog" as const;

export const POSTHOG_TOOLS_METADATA = createToolsRecord({
  get_organizations: { ... },
  get_sql_insight: { ... },
  // ... all 15+ tools
});

export const POSTHOG_SERVER = {
  serverInfo: {
    name: "posthog",
    version: "1.0.0",
    description: "Query PostHog analytics, manage insights and dashboards, track errors, and monitor LLM costs.",
    authorization: null, // Uses secrets, not OAuth
    icon: "PostHogLogo", // Request from designer
    documentationUrl: "https://docs.dust.tt/docs/posthog",
    instructions: "Requires a PostHog Personal API Key with 'MCP Server' preset permissions.",
  },
  // ... tools and stakes
} satisfies ServerMetadata;
```

### Step 3: Implement Tool Handlers

Key considerations:
- **State management**: Need to track active organization/project across tool calls
- **HogQL queries**: The `get_sql_insight` tool is the most powerful - generates SQL from natural language
- **Response rendering**: Format PostHog's verbose API responses into clean, LLM-friendly text

### Step 4: Register Server

1. Add to `constants.ts`:
```typescript
posthog: {
  id: XX, // Next available ID
  availability: "manual",
  allowMultipleInstances: true,
  isRestricted: undefined,
  isPreview: true, // Start as preview
  metadata: POSTHOG_SERVER,
}
```

2. Add to `servers/index.ts` switch statement

### Step 5: Additional Configuration

The server needs `additionalConfiguration` for:
```typescript
{
  region: "us" | "eu",
  defaultProjectId?: string, // Optional default project
}
```

---

## Key Implementation Details

### API Key Storage
- Use Dust's secrets system (`secretName` field in server configuration)
- Secret name: `posthog_api_key`

### HogQL Queries
The `get_sql_insight` tool should:
1. Accept natural language query description
2. Generate HogQL query
3. Execute against PostHog's query API
4. Return formatted results

Example HogQL queries:
```sql
-- Page views by country in last 7 days
SELECT properties.$geoip_country_name as country, count() as views
FROM events
WHERE event = '$pageview' AND timestamp > now() - interval 7 day
GROUP BY country
ORDER BY views DESC
LIMIT 10

-- Active users trend
SELECT toDate(timestamp) as day, count(distinct distinct_id) as users
FROM events
WHERE timestamp > now() - interval 30 day
GROUP BY day
ORDER BY day
```

### Error Response Handling
PostHog API errors should be caught and translated into helpful messages:
- 401: "Invalid API key. Please check your PostHog API key in Dust secrets."
- 403: "Insufficient permissions. Ensure your API key has the 'MCP Server' preset."
- 404: "Resource not found. Check the organization/project/insight ID."

### Response Rendering
Keep responses concise and formatted for LLM consumption:
```typescript
function renderInsight(insight: PostHogInsight): string {
  return [
    `**${insight.name}**`,
    `ID: ${insight.id}`,
    `Type: ${insight.filters?.insight || 'TRENDS'}`,
    insight.description ? `Description: ${insight.description}` : null,
    `Last modified: ${formatDate(insight.last_modified_at)}`,
    `Dashboard count: ${insight.dashboards?.length || 0}`,
  ].filter(Boolean).join('\n');
}
```

---

## Testing Strategy

1. **Unit tests**: Mock PostHog API responses, test each tool handler
2. **Integration tests**: Use PostHog test project with real API key
3. **Manual testing**: Test full flow in Dust UI

---

## Rollout Plan

1. **Phase 1 (MVP)**:
   - Organizations/Projects tools
   - `get_sql_insight` tool (most valuable)
   - `list_errors` tool
   - Mark as `isPreview: true`

2. **Phase 2**:
   - Full insights CRUD
   - Dashboard tools
   - LLM costs tool

3. **Phase 3**:
   - Remove preview flag
   - Add feature flag tools if requested

---

## Open Questions

1. **Icon**: Need to request PostHog logo from design team for Sparkle
2. **Documentation URL**: Create docs page at docs.dust.tt/docs/posthog
3. **Default project**: Should we auto-select first project or require explicit selection?
4. **Rate limits**: PostHog API rate limits - need to handle gracefully

---

## Sources

- [PostHog MCP Documentation](https://posthog.com/docs/model-context-protocol)
- [PostHog MCP GitHub](https://github.com/PostHog/mcp)
- [PostHog MCP Tools List](https://opentools.com/registry/posthog-mcp)
- [PostHog API Documentation](https://posthog.com/docs/api)
- [PulseMCP PostHog Server](https://www.pulsemcp.com/servers/posthog)
