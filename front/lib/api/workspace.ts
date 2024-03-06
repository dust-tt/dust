import type {
  LightWorkspaceType,
  ModelId,
  RoleType,
  SubscriptionType,
  UserTypeWithWorkspaces,
  WorkspaceDomain,
  WorkspaceSegmentationType,
  WorkspaceType,
} from "@dust-tt/types";
import type { MembershipInvitationType } from "@dust-tt/types";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import {
  Membership,
  MembershipInvitation,
  User,
  Workspace,
  WorkspaceHasDomain,
} from "@app/lib/models";

export async function getWorkspaceInfos(
  wId: string
): Promise<LightWorkspaceType | null> {
  const workspace = await Workspace.findOne({
    where: {
      sId: wId,
    },
  });

  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    sId: workspace.sId,
    name: workspace.name,
    role: "none",
    segmentation: workspace.segmentation,
  };
}

export async function getWorkspaceVerifiedDomain(
  workspace: LightWorkspaceType
): Promise<WorkspaceDomain | null> {
  const workspaceDomain = await WorkspaceHasDomain.findOne({
    attributes: ["domain", "domainAutoJoinEnabled"],
    where: {
      workspaceId: workspace.id,
    },
    // For now, one workspace can only have one domain.
    limit: 1,
  });

  if (workspaceDomain) {
    return {
      domain: workspaceDomain.domain,
      domainAutoJoinEnabled: workspaceDomain.domainAutoJoinEnabled,
    };
  }

  return null;
}

export async function setInternalWorkspaceSegmentation(
  auth: Authenticator,
  segmentation: WorkspaceSegmentationType
): Promise<LightWorkspaceType> {
  const owner = auth.workspace();
  const user = auth.user();

  if (!owner || !user || !auth.isDustSuperUser()) {
    throw new Error("Forbidden update to workspace segmentation.");
  }

  const workspace = await Workspace.findOne({
    where: {
      id: owner.id,
    },
  });

  if (!workspace) {
    throw new Error("Could not find workspace.");
  }

  await workspace.update({
    segmentation,
  });

  return {
    id: workspace.id,
    sId: workspace.sId,
    name: workspace.name,
    role: "none",
    segmentation: workspace.segmentation,
  };
}

/**
 * Returns the users members of the workspace associated with the authenticator (without listing
 * their own workspaces).
 * @param auth Authenticator
 * @param role RoleType optional filter on role
 * @returns UserType[] members of the workspace
 */
export async function getMembers(
  auth: Authenticator,
  {
    roles,
    userIds,
  }: {
    roles?: RoleType[];
    userIds?: ModelId[];
  } = {}
): Promise<UserTypeWithWorkspaces[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const whereClause: {
    workspaceId: ModelId;
    userId?: ModelId[];
    role?: RoleType[];
  } = userIds
    ? { workspaceId: owner.id, userId: userIds }
    : { workspaceId: owner.id };
  if (roles) {
    whereClause.role = roles;
  }

  const memberships = await Membership.findAll({
    where: whereClause,
  });

  const users = await User.findAll({
    where: {
      id: memberships.map((m) => m.userId),
    },
  });

  return users.map((u) => {
    const m = memberships.find((m) => m.userId === u.id);
    let role = "none" as RoleType;
    if (m) {
      switch (m.role) {
        case "admin":
        case "builder":
        case "user":
          role = m.role;
          break;
        default:
          role = "none";
      }
    }

    return {
      id: u.id,
      createdAt: u.createdAt.getTime(),
      provider: u.provider,
      username: u.username,
      email: u.email,
      fullName: u.firstName + (u.lastName ? ` ${u.lastName}` : ""),
      firstName: u.firstName,
      lastName: u.lastName,
      image: u.imageUrl,
      workspaces: [{ ...owner, role, flags: null }],
    };
  });
}

export async function getMembersCount(
  auth: Authenticator,
  { activeOnly }: { activeOnly?: boolean } = {}
): Promise<number> {
  const owner = auth.workspace();
  if (!owner) {
    return 0;
  }

  return getMembersCountForWorkspace(owner, { activeOnly });
}

export async function getMembersCountForWorkspace(
  workspace: WorkspaceType | Workspace,
  { activeOnly }: { activeOnly?: boolean } = {}
): Promise<number> {
  const whereClause = activeOnly
    ? {
        role: {
          [Op.ne]: "revoked",
        },
      }
    : {};

  return Membership.count({
    where: {
      workspaceId: workspace.id,
      ...whereClause,
    },
  });
}

export async function checkWorkspaceSeatAvailabilityUsingAuth(
  auth: Authenticator
): Promise<boolean> {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !subscription) {
    return false;
  }

  return evaluateWorkspaceSeatAvailability(owner, subscription);
}

export async function evaluateWorkspaceSeatAvailability(
  workspace: WorkspaceType | Workspace,
  subscription: SubscriptionType
): Promise<boolean> {
  const { maxUsers } = subscription.plan.limits.users;
  if (maxUsers === -1) {
    return true;
  }

  const activeMembersCount = await getMembersCountForWorkspace(workspace, {
    activeOnly: true,
  });

  return activeMembersCount < maxUsers;
}

/**
 * Returns the pending inviations associated with the authenticator's owner workspace.
 * @param auth Authenticator
 * @returns MenbershipInvitation[] members of the workspace
 */
export async function getPendingInvitations(
  auth: Authenticator
): Promise<MembershipInvitationType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const invitations = await MembershipInvitation.findAll({
    where: {
      workspaceId: owner.id,
      status: "pending",
    },
  });

  return invitations.map((i) => {
    return {
      id: i.id,
      status: i.status,
      inviteEmail: i.inviteEmail,
    };
  });
}
