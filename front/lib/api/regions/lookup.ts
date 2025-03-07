import type { Result } from "@dust-tt/types";
import { Err, isAPIErrorResponse, Ok } from "@dust-tt/types";

import type { RegionType } from "@app/lib/api/regions/config";
import { config } from "@app/lib/api/regions/config";
import { isWorkspaceRelocationDone } from "@app/lib/api/workspace";
import { getPendingMembershipInvitationWithWorkspaceForEmail } from "@app/lib/iam/invitations";
import { findWorkspaceWithVerifiedDomain } from "@app/lib/iam/workspaces";
import { Workspace } from "@app/lib/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type {
  UserLookupRequestBodyType,
  UserLookupResponse,
} from "@app/pages/api/lookup/[resource]";

interface UserLookup {
  email: string;
  email_verified: boolean;
}

export async function lookupUserRegionByEmail(
  userLookup: UserLookup
): Promise<boolean> {
  // Check if user exists, has pending invitations or has a workspace with verified domain.
  const [pendingInvite, workspaceWithVerifiedDomain] = await Promise.all([
    getPendingMembershipInvitationWithWorkspaceForEmail(userLookup.email),
    findWorkspaceWithVerifiedDomain({
      email: userLookup.email,
      email_verified: userLookup.email_verified,
    }),
  ]);

  if (pendingInvite || workspaceWithVerifiedDomain) {
    return true;
  }

  return false;
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
