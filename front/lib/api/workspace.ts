import type {
  LightWorkspaceType,
  MembershipRoleType,
  RoleType,
  SubscriptionType,
  UserType,
  UserTypeWithWorkspaces,
  WorkspaceDomain,
  WorkspaceSegmentationType,
  WorkspaceType,
} from "@dust-tt/types";

import type { PaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { Workspace, WorkspaceHasDomain } from "@app/lib/models/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

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
    whiteListedProviders: workspace.whiteListedProviders,
    defaultEmbeddingProvider: workspace.defaultEmbeddingProvider,
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

export async function getWorkspaceCreationDate(
  workspaceId: string
): Promise<Date> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  return workspace.createdAt;
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
    whiteListedProviders: workspace.whiteListedProviders,
    defaultEmbeddingProvider: workspace.defaultEmbeddingProvider,
  };
}

/**
 * Returns the users members of the workspace associated with the authenticator (without listing
 * their own workspaces).
 * @param auth Authenticator
 * @param role RoleType optional filter on role
 * @param paginationParams PaginationParams optional pagination parameters
 * @returns An object containing an array of UserTypeWithWorkspaces and the total count of members.
 */
export async function getMembers(
  auth: Authenticator,
  {
    roles,
    activeOnly,
  }: {
    roles?: MembershipRoleType[];
    activeOnly?: boolean;
  } = {},
  paginationParams?: PaginationParams
): Promise<{ members: UserTypeWithWorkspaces[]; total: number }> {
  const owner = auth.workspace();
  if (!owner) {
    return { members: [], total: 0 };
  }

  const { memberships, total } = activeOnly
    ? await MembershipResource.getActiveMemberships({
        workspace: owner,
        roles,
        paginationParams,
      })
    : await MembershipResource.getLatestMemberships({
        workspace: owner,
        roles,
        paginationParams,
      });

  const users = await UserResource.fetchByModelIds(
    memberships.map((m) => m.userId)
  );

  const usersWithWorkspaces = users.map((u) => {
    const m = memberships.find((m) => m.userId === u.id);
    let role = "none" as RoleType;
    if (m && !m.isRevoked()) {
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
      ...u.toJSON(),
      workspaces: [{ ...owner, role, flags: null }],
    };
  });

  return { members: usersWithWorkspaces, total };
}

export async function searchMembers(
  auth: Authenticator,
  options: {
    email?: string;
  },
  paginationParams: PaginationParams
): Promise<{ members: UserType[]; total: number }> {
  const owner = auth.workspace();
  if (!owner) {
    return { members: [], total: 0 };
  }

  const { users, total } = await UserResource.listUsersWithEmailPredicat(
    owner.id,
    {
      email: options.email,
    },
    paginationParams
  );

  return { members: users.map((u) => u.toJSON()), total };
}

export async function getMembersCount(
  auth: Authenticator,
  { activeOnly = false }: { activeOnly?: boolean } = {}
): Promise<number> {
  const owner = auth.workspace();
  if (!owner) {
    return 0;
  }

  return MembershipResource.getMembersCountForWorkspace({
    workspace: owner,
    activeOnly,
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

  const activeMembersCount =
    await MembershipResource.getMembersCountForWorkspace({
      workspace: renderLightWorkspaceType({ workspace }),
      activeOnly: true,
    });

  return activeMembersCount < maxUsers;
}

export async function unsafeGetWorkspacesByModelId(
  modelIds: number[]
): Promise<LightWorkspaceType[]> {
  if (modelIds.length === 0) {
    return [];
  }
  return (
    await Workspace.findAll({
      where: {
        id: modelIds,
      },
    })
  ).map((w) => renderLightWorkspaceType({ workspace: w }));
}
