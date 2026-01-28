# PostHog MCP Integration Plan for Dust

## Approach: Thin Wrapper Around PostHog's Hosted MCP Server

Add PostHog as a default remote MCP server in `front/lib/actions/mcp_internal_actions/remote_servers.ts`, similar to Stripe/Linear/Asana.

This gives immediate access to all 27 PostHog tools with minimal implementation effort.

---

## Implementation

Add to `DEFAULT_REMOTE_MCP_SERVERS` in `remote_servers.ts`:

```typescript
{
  id: 10009, // Next available ID after Supabase/Guru
  name: "PostHog",
  description: "PostHog tools for product analytics, error tracking, and feature flags.",
  url: "https://mcp.posthog.com/sse",
  icon: "ActionPieChartIcon", // Use existing icon; request PostHogLogo for Sparkle later
  documentationUrl: "https://posthog.com/docs/model-context-protocol",
  connectionInstructions:
    "You will need to provide your PostHog Personal API Key as a bearer token. " +
    "Create an API key with the 'MCP Server' preset at https://app.posthog.com/settings/user-api-keys",
  authMethod: "bearer",
  toolStakes: {
    // Organizations & Projects
    "organizations-get": "never_ask",
    "organization-set-active": "never_ask",
    "organization-details-get": "never_ask",
    "projects-get": "never_ask",
    "project-set-active": "never_ask",

    // Analytics / Insights (read)
    "property-definitions": "never_ask",
    "get-sql-insight": "low", // Arbitrary read access to analytics data
    "insights-get-all": "never_ask",
    "insight-get": "never_ask",

    // Analytics / Insights (write)
    "insight-create-from-query": "low",
    "insight-update": "low",
    "insight-delete": "high",

    // Dashboards (read)
    "dashboards-get-all": "never_ask",
    "dashboard-get": "never_ask",

    // Dashboards (write)
    "dashboard-create": "low",
    "dashboard-update": "low",
    "dashboard-delete": "high",
    "add-insight-to-dashboard": "low",

    // Error Tracking
    "list-errors": "never_ask",
    "error-details": "never_ask",

    // Feature Flags (read)
    "feature-flag-get-definition": "never_ask",
    "feature-flag-get-all": "never_ask",

    // Feature Flags (write)
    "create-feature-flag": "high",
    "update-feature-flag": "high",
    "delete-feature-flag": "high",

    // LLM Observability
    "get-llm-total-costs-for-project": "never_ask",

    // Documentation
    "docs-search": "never_ask",
  },
},
{
  id: 10010,
  name: "PostHog EU",
  description: "PostHog tools for product analytics (EU region).",
  url: "https://mcp.posthog.com/sse?region=eu",
  icon: "ActionPieChartIcon",
  documentationUrl: "https://posthog.com/docs/model-context-protocol",
  connectionInstructions:
    "You will need to provide your PostHog Personal API Key as a bearer token. " +
    "Create an API key with the 'MCP Server' preset at https://eu.posthog.com/settings/user-api-keys",
  authMethod: "bearer",
  toolStakes: {
    // Same as above
  },
},
```

---

## Tool Stakes Rationale

| Stake | Tools | Reason |
|-------|-------|--------|
| `never_ask` | Read operations (get, list, search) | No side effects |
| `low` | `get-sql-insight` | Arbitrary read access to analytics data (potential PII) |
| `low` | Create/update insights, dashboards | Write but reversible |
| `high` | Delete operations | Destructive |
| `high` | Feature flag CRUD | Production impact |

---

## Open Questions

1. **Two entries (US/EU) or one?**
   - Datadog pattern uses two entries
   - Could also be one entry with instructions to modify URL for EU
   - **Recommendation**: Two entries for clarity

2. **PostHog Logo icon**
   - Currently using `ActionPieChartIcon`
   - Need to request `PostHogLogo` addition to Sparkle

3. **Tool name verification**
   - Need to verify exact tool names from PostHog's MCP server
   - Names above are based on documentation; may need adjustment

---

## Testing

1. Add entry to `remote_servers.ts`
2. Restart front
3. In agent builder, add PostHog as a remote MCP server
4. Configure with PostHog API key
5. Test tool invocations

---

## Sources

- [PostHog MCP Documentation](https://posthog.com/docs/model-context-protocol)
- [PostHog MCP GitHub](https://github.com/PostHog/mcp) (archived, moved to monorepo)
- [PostHog MCP Tools List](https://opentools.com/registry/posthog-mcp)
