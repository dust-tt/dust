/**
 * Legacy Poke cache descriptors awaiting migration to owner-defined cache
 * handles. Do not add entries here: new caches should expose operations from
 * their owning Resource or query module.
 */

export interface CacheResourceParam {
  key: string;
  label: string;
  type: "string" | "number";
  placeholder: string;
}

export interface CacheResourceDefinition {
  id: string;
  label: string;
  fnName: string;
  params: CacheResourceParam[];
  buildResolverKey: (params: Record<string, string>) => string;
  // Redis glob pattern matching the resolver keys of all entries of this resource type. Used by
  // poke to bulk-delete every cache entry for the resource. Omit when the full key (fnName +
  // resolver key) is too generic to match safely (e.g. an anonymous fnName with an unprefixed
  // resolver key).
  resolverKeyPattern?: string;
}

export function buildCacheKey(
  resource: CacheResourceDefinition,
  params: Record<string, string>
): string {
  return `cacheWithRedis-${resource.fnName}-${resource.buildResolverKey(params)}`;
}

export function buildCacheKeyPattern(
  resource: CacheResourceDefinition
): string | null {
  if (!resource.resolverKeyPattern) {
    return null;
  }
  return `cacheWithRedis-${resource.fnName}-${resource.resolverKeyPattern}`;
}

// Bump these versions whenever the shape or the semantics of the cached payload
// change (e.g. a new field added).
export const SUBSCRIPTION_CACHE_KEY_VERSION = 2;

export const CACHE_RESOURCE_REGISTRY: CacheResourceDefinition[] = [
  {
    id: "user_by_workos_id",
    label: "User (by WorkOS ID)",
    fnName: "_fetchByWorkOSUserIdUncached",
    params: [
      {
        key: "workOSUserId",
        label: "WorkOS User ID",
        type: "string",
        placeholder: "e.g. user_01ABC...",
      },
    ],
    buildResolverKey: (p) => `user:workos:${p.workOSUserId}`,
    resolverKeyPattern: "user:workos:*",
  },
  {
    id: "subscription_by_workspace",
    label: "Subscription (by workspace ModelId)",
    fnName: "_fetchActiveByWorkspaceModelIdUncached",
    params: [
      {
        key: "workspaceModelId",
        label: "Workspace ModelId",
        type: "number",
        placeholder: "e.g. 42",
      },
    ],
    buildResolverKey: (p) =>
      `subscription:active:workspaceId:${p.workspaceModelId}:v${SUBSCRIPTION_CACHE_KEY_VERSION}`,
    resolverKeyPattern: `subscription:active:workspaceId:*:v${SUBSCRIPTION_CACHE_KEY_VERSION}`,
  },
  {
    id: "membership_role",
    label: "Membership role",
    fnName: "_getActiveRoleForUserInWorkspaceUncached",
    params: [
      {
        key: "userModelId",
        label: "User ModelId",
        type: "number",
        placeholder: "e.g. 1",
      },
      {
        key: "workspaceModelId",
        label: "Workspace ModelId",
        type: "number",
        placeholder: "e.g. 42",
      },
    ],
    buildResolverKey: (p) =>
      `role:user:${p.userModelId}:workspace:${p.workspaceModelId}`,
    resolverKeyPattern: "role:user:*",
  },
  {
    id: "workos_orgs_for_user",
    label: "WorkOS organizations (for user)",
    fnName: "findWorkOSOrganizationsForUserIdUncached",
    params: [
      {
        key: "userId",
        label: "User ModelId",
        type: "string",
        placeholder: "e.g. 123",
      },
    ],
    buildResolverKey: (p) => `workos-orgs-${p.userId}`,
    resolverKeyPattern: "workos-orgs-*",
  },
  {
    id: "workspace_region",
    label: "Workspace region",
    fnName: "_lookupWorkspaceUncached",
    params: [
      {
        key: "wId",
        label: "Workspace sId",
        type: "string",
        placeholder: "e.g. abc123",
      },
    ],
    buildResolverKey: (p) => `workspace-region:${p.wId}`,
    resolverKeyPattern: "workspace-region:*",
  },
  {
    id: "workspace_cell",
    label: "Workspace cell",
    fnName: "_lookupWorkspaceUncached",
    params: [
      {
        key: "wId",
        label: "Workspace sId",
        type: "string",
        placeholder: "e.g. abc123",
      },
    ],
    buildResolverKey: (p) => `workspace-cell:${p.wId}`,
    resolverKeyPattern: "workspace-cell:*",
  },
  {
    id: "provider_status",
    label: "Provider status",
    fnName: "getProvidersStatus",
    params: [
      {
        key: "region",
        label: "Region",
        type: "string",
        placeholder: "e.g. us-east-1",
      },
    ],
    buildResolverKey: (p) => `provider-status-${p.region}`,
    resolverKeyPattern: "provider-status-*",
  },
  {
    id: "dust_status",
    label: "Dust status",
    fnName: "getDustStatus",
    params: [
      {
        key: "region",
        label: "Region",
        type: "string",
        placeholder: "e.g. us-east-1",
      },
    ],
    buildResolverKey: (p) => `dust-status-${p.region}`,
    resolverKeyPattern: "dust-status-*",
  },
  {
    id: "key_monthly_cap",
    label: "Key monthly cap",
    fnName: "fetchKeyMonthlyCap",
    params: [
      {
        key: "keyId",
        label: "Key ModelId",
        type: "number",
        placeholder: "e.g. 7",
      },
    ],
    buildResolverKey: (p) => `key-cap:${p.keyId}`,
    resolverKeyPattern: "key-cap:*",
  },
  {
    id: "slack_channels",
    label: "Slack channels",
    fnName: "anonymous",
    params: [
      {
        key: "mcpServerId",
        label: "MCP Server ModelId",
        type: "number",
        placeholder: "e.g. 123",
      },
    ],
    buildResolverKey: (p) => `${p.mcpServerId}`,
  },
  {
    id: "slack_users",
    label: "Slack users",
    fnName: "anonymous",
    params: [
      {
        key: "mcpServerId",
        label: "MCP Server ModelId",
        type: "number",
        placeholder: "e.g. 123",
      },
    ],
    buildResolverKey: (p) => `slack_users_${p.mcpServerId}`,
    resolverKeyPattern: "slack_users_*",
  },
  {
    id: "metronome_balance_threshold",
    label: "Metronome balance threshold",
    fnName: "fetchWorkspaceBalanceThreshold",
    params: [
      {
        key: "metronomeCustomerId",
        label: "Metronome Customer ID",
        type: "string",
        placeholder: "e.g. 550e8400-e29b-41d4-a716-446655440000",
      },
      {
        key: "workspaceId",
        label: "Workspace sId",
        type: "string",
        placeholder: "e.g. abc123",
      },
    ],
    buildResolverKey: (p) =>
      `balance-threshold-${p.metronomeCustomerId}-${p.workspaceId}`,
    resolverKeyPattern: "balance-threshold-*",
  },
  {
    id: "metronome_per_user_cap_alert_ids",
    label: "Metronome per-user cap alert ids",
    fnName: "fetchPerUserCapAlertIds",
    params: [
      {
        key: "metronomeCustomerId",
        label: "Metronome Customer ID",
        type: "string",
        placeholder: "e.g. 550e8400-e29b-41d4-a716-446655440000",
      },
      {
        key: "workspaceId",
        label: "Workspace sId",
        type: "string",
        placeholder: "e.g. abc123",
      },
    ],
    buildResolverKey: (p) =>
      `per-user-cap-alert-${p.metronomeCustomerId}-${p.workspaceId}`,
    resolverKeyPattern: "per-user-cap-alert-*",
  },
  {
    id: "metronome_default_cap_thresholds_by_seat_type",
    label: "Metronome default cap thresholds by seat type",
    fnName: "fetchDefaultCapThresholdsBySeatType",
    params: [
      {
        key: "metronomeCustomerId",
        label: "Metronome Customer ID",
        type: "string",
        placeholder: "e.g. 550e8400-e29b-41d4-a716-446655440000",
      },
      {
        key: "workspaceId",
        label: "Workspace sId",
        type: "string",
        placeholder: "e.g. abc123",
      },
    ],
    buildResolverKey: (p) =>
      `cap-threshold-by-seat-${p.metronomeCustomerId}-${p.workspaceId}`,
    resolverKeyPattern: "cap-threshold-by-seat-*",
  },
  {
    id: "metronome_workspace_alert_ids",
    label: "Metronome workspace alert IDs",
    fnName: "fetchWorkspaceMetronomeAlertIds",
    params: [
      {
        key: "metronomeCustomerId",
        label: "Metronome Customer ID",
        type: "string",
        placeholder: "e.g. 550e8400-e29b-41d4-a716-446655440000",
      },
      {
        key: "workspaceId",
        label: "Workspace sId",
        type: "string",
        placeholder: "e.g. abc123",
      },
    ],
    buildResolverKey: (p) =>
      `metronome-alerts-${p.metronomeCustomerId}-${p.workspaceId}`,
    resolverKeyPattern: "metronome-alerts-*",
  },
];

export function getCacheResourceById(
  id: string
): CacheResourceDefinition | undefined {
  return CACHE_RESOURCE_REGISTRY.find((r) => r.id === id);
}
