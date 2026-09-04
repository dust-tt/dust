import { config } from "@app/lib/api/cells/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { isWorkspaceRelocationDone } from "@app/lib/api/workspace";
import { findWorkspaceWithVerifiedDomain } from "@app/lib/iam/workspaces";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import { getMembershipInvitationToken } from "@app/lib/utils/invitation_token";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { CellInfo, CellType } from "@app/types/cell";
import { isCellType } from "@app/types/cell";
import { isAPIErrorResponse } from "@app/types/error";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

export type WorkspaceLookupResponse = {
  workspace: {
    sId: string;
  } | null;
};

export type UserLookupResponse = {
  exists: boolean;
};

export type InvitationsLookupResponse = {
  pendingInvitations: PendingInvitationOption[];
};

export type ShareTokenLookupResponse = {
  exists: boolean;
};

const ExternalUserCodec = z.object({
  email: z.string(),
  email_verified: z.boolean(),
});

export const UserLookupSchema = z.object({
  user: ExternalUserCodec,
});

export const WorkspaceLookupSchema = z.object({
  workspace: z.string(),
});

export const InvitationsLookupSchema = z.object({
  email: z.string(),
});

export const ShareTokenLookupSchema = z.object({
  token: z.string(),
});

export type UserLookupRequestBodyType = z.infer<typeof UserLookupSchema>;

export type WorkspaceLookupRequestBodyType = z.infer<
  typeof WorkspaceLookupSchema
>;

export type InvitationsLookupRequestBodyType = z.infer<
  typeof InvitationsLookupSchema
>;

export type ShareTokenLookupRequestBodyType = z.infer<
  typeof ShareTokenLookupSchema
>;

interface UserLookup {
  email: string;
  email_verified: boolean;
}

const WORKSPACE_CELL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours.

function isWorkOSNotFoundEntityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 404 &&
    "code" in error &&
    error.code === "entity_not_found"
  );
}

/**
 * Resolves a workspace's cell from WorkOS organization metadata.
 * Returns null when WorkOS cannot answer — callers should fall back to peer-cell
 * lookup in those cases:
 * - No WorkOS organization (common for free / never-upgraded workspaces).
 * - Organization exists but `metadata.cell` is missing or invalid (pre-backfill).
 */
async function lookupWorkspaceCellFromWorkOS(
  wId: string
): Promise<CellType | null> {
  try {
    const organization =
      await getWorkOS().organizations.getOrganizationByExternalId(wId);

    const cell = organization.metadata.cell;
    if (!cell || !isCellType(cell)) {
      return null;
    }

    return cell;
  } catch (error) {
    if (isWorkOSNotFoundEntityError(error)) {
      return null;
    }

    throw error;
  }
}

async function _lookupWorkspaceCellUncached(
  wId: string
): Promise<CellType | null> {
  const localLookup = await handleLookupWorkspace({ workspace: wId });
  if (localLookup.workspace) {
    return config.getCurrentCell().name;
  }

  const workOSCell = await lookupWorkspaceCellFromWorkOS(wId);
  if (workOSCell) {
    return workOSCell;
  }

  throw new Error("Workspace not found in WorkOS.");
}

const _lookupWorkspaceCellCached = cacheWithRedis(
  _lookupWorkspaceCellUncached,
  (wId) => `workspace-cell:${wId}`,
  { ttlMs: WORKSPACE_CELL_CACHE_TTL_MS }
);

const _invalidateWorkspaceCellCache = invalidateCacheWithRedis(
  _lookupWorkspaceCellUncached,
  (wId) => `workspace-cell:${wId}`
);

export async function invalidateWorkspaceCellCache(wId: string): Promise<void> {
  await _invalidateWorkspaceCellCache(wId);
}

export async function lookupWorkspaceCell(
  wId: string
): Promise<Result<CellInfo | null, Error>> {
  try {
    const cell = await _lookupWorkspaceCellCached(wId);
    return new Ok(cell ? config.getCellInfo(cell) : null);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

/**
 * Checks if a workspace exists in another cell and returns a redirect response if so.
 * Returns null if the workspace should be handled locally or doesn't exist.
 */
export async function getWorkspaceCellRedirect(
  wId: string
): Promise<CellInfo | null> {
  const lookupResult = await lookupWorkspaceCell(wId);

  if (lookupResult.isOk() && lookupResult.value) {
    const targetCell = lookupResult.value;
    const currentCell = config.getCurrentCell();

    if (targetCell.name !== currentCell.name) {
      return targetCell;
    }
  }

  return null;
}

async function lookupUserInOtherCells(
  userLookup: UserLookup
): Promise<Result<CellInfo | null, Error>> {
  const otherCells = config.getOtherCells();

  const body: UserLookupRequestBodyType = {
    user: userLookup,
  };

  try {
    // eslint-disable-next-line no-restricted-globals
    for (const cell of otherCells) {
      const res = await fetch(`${cell.url}/api/lookup/user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.getLookupApiSecret()}`,
        },
        body: JSON.stringify(body),
      });

      const data: UserLookupResponse = await res.json();
      if (isAPIErrorResponse(data)) {
        return new Err(new Error(data.error.message));
      }

      if (data.exists) {
        return new Ok(cell);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      return new Err(error);
    }
  }
  return new Ok(null);
}

export async function fetchInvitationsInOtherCells(
  email: string
): Promise<Result<PendingInvitationOption[], Error>> {
  const otherCells = config.getOtherCells();

  const body: InvitationsLookupRequestBodyType = { email };
  const invitations: PendingInvitationOption[] = [];

  try {
    // eslint-disable-next-line no-restricted-globals
    for (const cell of otherCells) {
      const res = await fetch(`${cell.url}/api/lookup/invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.getLookupApiSecret()}`,
        },
        body: JSON.stringify(body),
      });

      const data: InvitationsLookupResponse = await res.json();
      if (isAPIErrorResponse(data)) {
        return new Err(new Error(data.error.message));
      }

      invitations.push(
        ...data.pendingInvitations.map((inv) => ({
          ...inv,
          region: cell.region,
        }))
      );
    }
    return new Ok(invitations);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export async function lookupShareTokenInOtherCells(
  token: string
): Promise<Result<CellInfo | null, Error>> {
  const otherCells = config.getOtherCells();
  const body: ShareTokenLookupRequestBodyType = { token };

  try {
    for (const cell of otherCells) {
      // eslint-disable-next-line no-restricted-globals
      const res = await fetch(`${cell.url}/api/lookup/share-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.getLookupApiSecret()}`,
        },
        body: JSON.stringify(body),
      });

      const data: ShareTokenLookupResponse = await res.json();
      if (isAPIErrorResponse(data)) {
        return new Err(new Error(data.error.message));
      }

      if (data.exists) {
        return new Ok(cell);
      }
    }
  } catch (error) {
    return new Err(normalizeError(error));
  }

  return new Ok(null);
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

export async function checkUserCellAffinity(
  userLookup: UserLookup
): Promise<Result<CellInfo | null, Error>> {
  // First check locally if user has affinity to current region (invitation, whitelisted domain).
  const hasLocalAffinity = await hasEmailLocalCellAffinity(userLookup);
  if (hasLocalAffinity) {
    return new Ok(config.getCurrentCell());
  }

  // If not affinity in current cell, check in other cells
  const otherCellRes = await lookupUserInOtherCells(userLookup);
  return otherCellRes;
}

export async function hasEmailLocalCellAffinity(
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
