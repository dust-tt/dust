import type { RegionType } from "@app/lib/api/regions/config";
import { config } from "@app/lib/api/regions/config";
import { isWorkspaceRelocationDone } from "@app/lib/api/workspace";
import { getFeatureFlags } from "@app/lib/auth";
import { findWorkspaceWithVerifiedDomain } from "@app/lib/iam/workspaces";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type {
  AuthLookupResponse,
  UserLookupRequestBodyType,
  UserLookupResponse,
} from "@app/pages/api/lookup/[resource]";
import type { Result } from "@app/types";
import { Err, isAPIErrorResponse, Ok } from "@app/types";

interface UserLookup {
  email: string;
  email_verified: boolean;
}

export async function lookupUserRegionByEmail(
  userLookup: UserLookup
): Promise<boolean> {
  // Check if user exists, has pending invitations or has a workspace with verified domain.
  const [pendingInvite, workspaceWithVerifiedDomain] = await Promise.all([
    MembershipInvitationResource.getPendingForEmail(userLookup.email),
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

  // Check if pending invite exists but workspace has been relocated
  if (
    pendingInvite &&
    isWorkspaceRelocationDone(
      renderLightWorkspaceType({ workspace: pendingInvite.workspace })
    )
  ) {
    return false;
  }

  // Return true if there is either a valid pending invite or workspace with verified domain
  return Boolean(pendingInvite || workspaceWithVerifiedDomain);
}

export async function handleLookupWorkspace(workspaceLookup: {
  workspace: string;
}) {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceLookup.workspace },
  });

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

export async function lookupAuthInOtherRegion(
  userLookup: UserLookup
): Promise<Result<"auth0" | "workos", Error>> {
  const { url } = config.getOtherRegionInfo();

  const body: UserLookupRequestBodyType = {
    user: userLookup,
  };

  try {
    const otherRegionResponse = await fetch(`${url}/api/lookup/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.getLookupApiSecret()}`,
      },
      body: JSON.stringify(body),
    });

    const data: AuthLookupResponse = await otherRegionResponse.json();
    if (isAPIErrorResponse(data)) {
      return new Err(new Error(data.error.message));
    }

    return new Ok(data.auth);
  } catch (error) {
    if (error instanceof Error) {
      return new Err(error);
    }

    return new Err(new Error("Unknown error in lookupInOtherRegion"));
  }
}

type RegionAffinityResult =
  | { hasAffinity: true; region: RegionType }
  | { hasAffinity: false; region?: never };

export async function checkUserRegionAffinity(
  userLookup: UserLookup
): Promise<Result<RegionAffinityResult, Error>> {
  // First check locally if user has affinity to current region (invitation, whitelisted domain).
  const hasLocalAffinity = await lookupUserRegionByEmail(userLookup);
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

export async function lookupAuth(
  userLookup: UserLookup
): Promise<"auth0" | "workos"> {
  const workspaceHasDomain = await findWorkspaceWithVerifiedDomain({
    email: userLookup.email,
    email_verified: true,
  });
  const workspace = workspaceHasDomain?.workspace;
  if (workspace) {
    const ff = await getFeatureFlags(renderLightWorkspaceType({ workspace }));
    // Workspace is switched to workos: use workos
    if (ff.includes("workos")) {
      return "workos";
    }
  }

  return "auth0";
}
