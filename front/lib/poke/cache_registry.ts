import { keyCapCacheResolver } from "@app/lib/api/programmatic_usage/key_cap";
import { workspaceRegionCacheKeyResolver } from "@app/lib/api/regions/lookup";
import {
  dustStatusCacheKeyResolver,
  providerStatusCacheKeyResolver,
} from "@app/lib/api/status";
import { workOSOrganizationsCacheKeyResolver } from "@app/lib/api/workos/organization_membership";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { ModelId } from "@app/types/shared/model_id";

interface CacheParamDef {
  name: string;
  label: string;
  type: "string" | "number";
}

interface CacheRegistryEntry {
  label: string;
  description: string;
  fnName: string;
  params: CacheParamDef[];
  buildResolverKey: (params: Record<string, string>) => string;
}

export const CACHE_REGISTRY: Record<string, CacheRegistryEntry> = {
  workspace: {
    label: "Workspace",
    description: "Workspace fetched by sId",
    fnName: "_fetchByIdUncached",
    params: [{ name: "wId", label: "Workspace sId", type: "string" }],
    buildResolverKey: (p) => WorkspaceResource.workspaceCacheKeyResolver(p.wId),
  },
  subscription: {
    label: "Subscription",
    description: "Active subscription by workspace model ID",
    fnName: "_fetchActiveByWorkspaceModelIdUncached",
    params: [
      {
        name: "workspaceModelId",
        label: "Workspace Model ID",
        type: "number",
      },
    ],
    buildResolverKey: (p) =>
      SubscriptionResource.subscriptionCacheKeyResolver(
        Number(p.workspaceModelId) as ModelId
      ),
  },
  user_by_workos_id: {
    label: "User by WorkOS ID",
    description: "User fetched by WorkOS user ID",
    fnName: "_fetchByWorkOSUserIdUncached",
    params: [{ name: "workOSUserId", label: "WorkOS User ID", type: "string" }],
    buildResolverKey: (p) =>
      UserResource.userByWorkOSIdCacheKeyResolver(p.workOSUserId),
  },
  active_seats: {
    label: "Active Seats",
    description: "Count of active seats in a workspace",
    fnName: "countActiveSeatsInWorkspace",
    params: [{ name: "wId", label: "Workspace sId", type: "string" }],
    buildResolverKey: (p) => MembershipResource.seatsCacheKeyResolver(p.wId),
  },
  key_monthly_cap: {
    label: "Key Monthly Cap",
    description: "Monthly cap for an API key",
    fnName: "fetchKeyMonthlyCap",
    params: [{ name: "keyId", label: "Key ID", type: "number" }],
    buildResolverKey: (p) =>
      keyCapCacheResolver({ keyId: Number(p.keyId) as ModelId }),
  },
  workos_organizations: {
    label: "WorkOS Organizations",
    description: "WorkOS organizations for a user",
    fnName: "findWorkOSOrganizationsForUserIdUncached",
    params: [{ name: "userId", label: "User ID", type: "string" }],
    buildResolverKey: (p) =>
      workOSOrganizationsCacheKeyResolver(p.userId),
  },
  workspace_region: {
    label: "Workspace Region",
    description: "Region lookup for a workspace",
    fnName: "_lookupWorkspaceUncached",
    params: [{ name: "wId", label: "Workspace sId", type: "string" }],
    buildResolverKey: (p) => workspaceRegionCacheKeyResolver(p.wId),
  },
  provider_status: {
    label: "Provider Status",
    description: "Provider status for a region",
    fnName: "getProvidersStatus",
    params: [{ name: "region", label: "Region", type: "string" }],
    buildResolverKey: (p) => providerStatusCacheKeyResolver(p.region),
  },
  dust_status: {
    label: "Dust Status",
    description: "Dust status for a region",
    fnName: "getDustStatus",
    params: [{ name: "region", label: "Region", type: "string" }],
    buildResolverKey: (p) => dustStatusCacheKeyResolver(p.region),
  },
};

export function buildCacheRedisKey(
  entry: CacheRegistryEntry,
  params: Record<string, string>
): string {
  return `cacheWithRedis-${entry.fnName}-${entry.buildResolverKey(params)}`;
}
