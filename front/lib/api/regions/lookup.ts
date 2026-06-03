import { config } from "@app/lib/api/regions/config";
import { isWorkspaceRelocationDone } from "@app/lib/api/workspace";
import { findWorkspaceWithVerifiedDomain } from "@app/lib/iam/workspaces";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import { getMembershipInvitationToken } from "@app/lib/utils/invitation_token";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type {
  InvitationsLookupRequestBodyType,
  InvitationsLookupResponse,
  ShareTokenLookupRequestBodyType,
  ShareTokenLookupResponse,
  UserLookupRequestBodyType,
  UserLookupResponse,
  WorkspaceLookupRequestBodyType,
  WorkspaceLookupResponse,
} from "@app/pages/api/lookup/[resource]";
import type { RegionRedirectError } from "@app/types/error";
import { isAPIErrorResponse } from "@app/types/error";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import type { RegionType } from "@app/types/region";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

interface UserLookup {
  email: string;
  email_verified: boolean;
}

export async function hasEmailLocalRegionAffinity(
  userLookup: UserLookup
): Promise<boolean> {
  // Check if user exists, has pending invitations or has a workspace with verified domain.
  const [pendingInvites, workspaceWithVerifiedDomain] = await Promise.all([
    MembershipInvitationResource.listPendingForEmail({
      email: userLookup.email,
    }),

    findWorkspaceWithVerifiedDomain({
      email: userLookup.email,
      email_verified: userLookup.email_verified,
    }),
  ]);

  // Check if workspace with verified domain exists but has been relocated
  if (
    workspaceWithVerifiedDomain &&
    isWorkspaceRelocationDone(
      renderLightWorkspaceType({
        workspace: workspaceWithVerifiedDomain.workspace,
      })
    )
  ) {
    return false;
  }

  // Check if pending invites exist but workspace have been relocated
  if (
    pendingInvites.length > 0 &&
    pendingInvites.every((invite) =>
      isWorkspaceRelocationDone(
        renderLightWorkspaceType({ workspace: invite.workspace })
      )
    )
  ) {
    return false;
  }

  // Return true if there is either a valid pending invite or workspace with verified domain

  return Boolean(pendingInvites.length > 0 || workspaceWithVerifiedDomain);
}

export async function handleLookupWorkspace(workspaceLookup: {
  workspace: string;
}) {
  const workspace = await WorkspaceResource.fetchById(
    workspaceLookup.workspace
  );

  // If workspace is done relocating, return null so users get created in new region.
  if (
    workspace &&
    isWorkspaceRelocationDone(renderLightWorkspaceType({ workspace }))
  ) {
    return {
      workspace: null,
    };
  }

  return {
    workspace: workspace?.sId ? { sId: workspace.sId } : null,
  };
}

async function lookupInOtherRegion(
  userLookup: UserLookup
): Promise<Result<boolean, Error>> {
  const { url } = config.getOtherRegionInfo();

  const body: UserLookupRequestBodyType = {
    user: userLookup,
  };

  try {
    // eslint-disable-next-line no-restricted-globals
    const otherRegionResponse = await fetch(`${url}/api/lookup/user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.getLookupApiSecret()}`,
      },
      body: JSON.stringify(body),
    });

    const data: UserLookupResponse = await otherRegionResponse.json();
    if (isAPIErrorResponse(data)) {
      return new Err(new Error(data.error.message));
    }

    return new Ok(data.exists);
  } catch (error) {
    if (error instanceof Error) {
      return new Err(error);
    }

    return new Err(new Error("Unknown error in lookupInOtherRegion"));
  }
}

const WORKSPACE_REGION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours.

async function _lookupWorkspaceUncached(
  wId: string
): Promise<RegionType | null> {
  const body: WorkspaceLookupRequestBodyType = {
    workspace: wId,
  };

  const localLookup = await handleLookupWorkspace(body);
  if (localLookup.workspace) {
    return config.getCurrentRegion();
  }

  const { url, name } = config.getOtherRegionInfo();

  // eslint-disable-next-line no-restricted-globals
  const otherRegionResponse = await fetch(`${url}/api/lookup/workspace`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.getLookupApiSecret()}`,
    },
    body: JSON.stringify(body),
  });

  const data: WorkspaceLookupResponse = await otherRegionResponse.json();
  if (isAPIErrorResponse(data)) {
    throw new Error(data.error.message);
  }

  return data.workspace ? name : null;
}

const _lookupWorkspaceCached = cacheWithRedis(
  _lookupWorkspaceUncached,
  (wId) => `workspace-region:${wId}`,
  { ttlMs: WORKSPACE_REGION_CACHE_TTL_MS }
);

const _invalidateWorkspaceRegionCache = invalidateCacheWithRedis(
  _lookupWorkspaceUncached,
  (wId) => `workspace-region:${wId}`
);

export async function invalidateWorkspaceRegionCache(
  wId: string
): Promise<void> {
  await _invalidateWorkspaceRegionCache(wId);
}

export async function lookupWorkspace(
  wId: string
): Promise<Result<RegionType | null, Error>> {
  try {
    const region = await _lookupWorkspaceCached(wId);
    return new Ok(region);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

type RegionAffinityResult =
  | { hasAffinity: true; region: RegionType }
  | { hasAffinity: false; region?: never };

export async function checkUserRegionAffinity(
  userLookup: UserLookup
): Promise<Result<RegionAffinityResult, Error>> {
  // First check locally if user has affinity to current region (invitation, whitelisted domain).
  const hasLocalAffinity = await hasEmailLocalRegionAffinity(userLookup);
  if (hasLocalAffinity) {
    return new Ok({ hasAffinity: true, region: config.getCurrentRegion() });
  }

  // If not affinity in current region, check in other region.
  const hasAffinitInOtherRegionRes = await lookupInOtherRegion(userLookup);
  if (hasAffinitInOtherRegionRes.isErr()) {
    return hasAffinitInOtherRegionRes;
  }

  const hasAffinitInOtherRegion = hasAffinitInOtherRegionRes.value;
  if (hasAffinitInOtherRegion) {
    return new Ok({
      hasAffinity: hasAffinitInOtherRegion,
      region: config.getOtherRegionInfo().name,
    });
  }

  // User does not have affinity to any region.
  return new Ok({ hasAffinity: false });
}

export async function handleLookupInvitations(
  email: string
): Promise<InvitationsLookupResponse> {
  const invitationResources =
    await MembershipInvitationResource.listPendingForEmail({ email });

  const pendingInvitations: PendingInvitationOption[] = invitationResources.map(
    (invitation) => ({
      workspaceName: invitation.workspace.name,
      initialRole: invitation.initialRole,
      createdAt: invitation.createdAt.getTime(),
      token: getMembershipInvitationToken(invitation.toJSON()),
      isExpired: invitation.isExpired(),
    })
  );

  return { pendingInvitations };
}

export async function fetchInvitationsFromOtherRegion(
  email: string
): Promise<Result<PendingInvitationOption[], Error>> {
  const { name, url } = config.getOtherRegionInfo();

  const body: InvitationsLookupRequestBodyType = { email };

  try {
    // eslint-disable-next-line no-restricted-globals
    const otherRegionResponse = await fetch(`${url}/api/lookup/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.getLookupApiSecret()}`,
      },
      body: JSON.stringify(body),
    });

    const data: InvitationsLookupResponse = await otherRegionResponse.json();
    if (isAPIErrorResponse(data)) {
      return new Err(new Error(data.error.message));
    }

    const invitations = data.pendingInvitations.map((inv) => ({
      ...inv,
      region: name,
    }));

    return new Ok(invitations);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export async function lookupShareToken(
  token: string
): Promise<Result<RegionType | null, Error>> {
  const { url, name } = config.getOtherRegionInfo();
  const body: ShareTokenLookupRequestBodyType = { token };

  try {
    // eslint-disable-next-line no-restricted-globals
    const otherRegionResponse = await fetch(`${url}/api/lookup/share-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.getLookupApiSecret()}`,
      },
      body: JSON.stringify(body),
    });

    const data: ShareTokenLookupResponse = await otherRegionResponse.json();
    if (isAPIErrorResponse(data)) {
      return new Err(new Error(data.error.message));
    }

    return new Ok(data.exists ? name : null);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

// Regional API subdomains the SPA can be forced onto via the `force_us_api_url`
// feature flag. Hardcoded on purpose: these are stable public hostnames that
// are independent of the per-environment app URLs in `config`.
const REGION_API_URLS: Record<RegionType, string> = {
  "europe-west1": "https://eu-api.dust.tt",
  "us-central1": "https://us-api.dust.tt",
};

/**
 * When the `force_us_api_url` flag is enabled on a workspace, returns a redirect
 * that points the SPA at the current region's API subdomain (us-api/eu-api.dust.tt)
 * so it uses that as its backend. Returns null when the flag is disabled or when
 * the request already arrived on the target host (avoids a redirect loop once the
 * SPA has switched).
 */
export function getForcedApiUrlRedirect({
  enabled,
  requestHost,
}: {
  enabled: boolean;
  requestHost: string | undefined;
}): RegionRedirectError | null {
  if (!enabled) {
    return null;
  }

  const currentRegion = config.getCurrentRegion();
  const targetUrl = REGION_API_URLS[currentRegion];

  if (requestHost === new URL(targetUrl).host) {
    return null;
  }

  return {
    region: currentRegion,
    url: targetUrl,
  };
}

/**
 * Checks if a workspace exists in another region and returns a redirect response if so.
 * Returns null if the workspace should be handled locally or doesn't exist.
 */
export async function getWorkspaceRegionRedirect(
  wId: string
): Promise<RegionRedirectError | null> {
  const lookupResult = await lookupWorkspace(wId);

  if (lookupResult.isOk() && lookupResult.value) {
    const targetRegion = lookupResult.value;
    const currentRegion = config.getCurrentRegion();

    if (targetRegion !== currentRegion) {
      const targetUrl = config.getRegionUrl(targetRegion);
      return {
        region: targetRegion,
        url: targetUrl,
      };
    }
  }

  return null;
}
