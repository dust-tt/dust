import type {
  LightWorkspaceType,
  MembershipRoleType,
  Result,
  RoleType,
  SubscriptionType,
  UserTypeWithWorkspaces,
  WorkspaceDomain,
  WorkspaceSegmentationType,
  WorkspaceType,
} from "@dust-tt/types";
import { ACTIVE_ROLES, Err, Ok, removeNulls } from "@dust-tt/types";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import { WorkspaceHasDomain } from "@app/lib/models/workspace_has_domain";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import type { MembershipsPaginationParams } from "@app/lib/resources/membership_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { SearchMembersPaginationParams } from "@app/lib/resources/user_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchDeleteWorkspaceWorkflow } from "@app/poke/temporal/client";

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

  return renderLightWorkspaceType({ workspace });
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

  return renderLightWorkspaceType({ workspace });
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
  paginationParams?: MembershipsPaginationParams
): Promise<{
  members: UserTypeWithWorkspaces[];
  total: number;
  nextPageParams?: MembershipsPaginationParams;
}> {
  const owner = auth.workspace();
  if (!owner) {
    return { members: [], total: 0 };
  }

  const { memberships, total, nextPageParams } = activeOnly
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

  const usersWithWorkspaces = await Promise.all(
    memberships.map(async (m) => {
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

      let user: UserResource | null;
      if (!m.user) {
        user = await UserResource.fetchByModelId(m.userId);
      } else {
        user = new UserResource(UserModel, m.user);
      }

      if (!user) {
        return null;
      }

      return {
        ...user.toJSON(),
        workspaces: [{ ...owner, role, flags: null }],
      };
    })
  );

  return {
    members: removeNulls(usersWithWorkspaces),
    total,
    nextPageParams,
  };
}

export async function searchMembers(
  auth: Authenticator,
  options: {
    searchTerm?: string;
    searchEmails?: string[];
  },
  paginationParams: SearchMembersPaginationParams
): Promise<{ members: UserTypeWithWorkspaces[]; total: number }> {
  const owner = auth.workspace();
  if (!owner) {
    return { members: [], total: 0 };
  }

  let users: UserResource[];
  let total: number;

  if (options.searchEmails) {
    if (options.searchEmails.length > MAX_SEARCH_EMAILS) {
      logger.error("Too many emails provided.");
      return { members: [], total: 0 };
    }

    users = await UserResource.listUserWithExactEmails(
      owner,
      options.searchEmails
    );
    total = users.length;
  } else {
    const results = await UserResource.listUsersWithEmailPredicat(
      owner,
      {
        email: options.searchTerm,
      },
      paginationParams
    );
    users = results.users;
    total = results.total;
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace: owner,
  });

  const usersWithWorkspaces = users.map((u) => {
    const membership = memberships.find(
      (m) => m.userId === u.id && m.workspaceId === owner.id
    );
    const role =
      membership && !membership.isRevoked()
        ? ACTIVE_ROLES.includes(membership.role)
          ? membership.role
          : ("none" as RoleType)
        : ("none" as RoleType);

    return {
      ...u.toJSON(),
      workspaces: [{ ...owner, role, flags: null }],
    };
  });

  return { members: usersWithWorkspaces, total };
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

export async function areAllSubscriptionsCanceled(
  workspace: LightWorkspaceType
): Promise<boolean> {
  const subscriptions = await Subscription.findAll({
    where: {
      workspaceId: workspace.id,
      stripeSubscriptionId: {
        [Op.not]: null,
      },
    },
  });

  // If the workspace had a subscription, it must be canceled.
  if (subscriptions.length > 0) {
    for (const sub of subscriptions) {
      if (!sub.stripeSubscriptionId) {
        continue;
      }

      const stripeSubscription = await getStripeSubscription(
        sub.stripeSubscriptionId
      );

      if (!stripeSubscription) {
        continue;
      }

      if (stripeSubscription.status !== "canceled") {
        return false;
      }
    }
  }

  return true;
}

export async function deleteWorkspace(
  owner: LightWorkspaceType
): Promise<Result<void, Error>> {
  const allSubscriptionsCanceled = await areAllSubscriptionsCanceled(owner);
  if (!allSubscriptionsCanceled) {
    return new Err(
      new Error(
        "The workspace cannot be deleted because there are active subscriptions."
      )
    );
  }

  await launchDeleteWorkspaceWorkflow({ workspaceId: owner.sId });

  return new Ok(undefined);
}

export async function changeWorkspaceName(
  owner: LightWorkspaceType,
  newName: string
): Promise<Result<void, Error>> {
  const [affectedCount] = await Workspace.update(
    { name: newName },
    {
      where: {
        id: owner.id,
      },
    }
  );

  if (affectedCount === 0) {
    return new Err(new Error("Workspace not found."));
  }

  return new Ok(undefined);
}

export async function updateWorkspaceConversationsRetention(
  owner: LightWorkspaceType,
  nbDays: number
): Promise<Result<void, Error>> {
  const [affectedCount] = await Workspace.update(
    { conversationsRetentionDays: nbDays === -1 ? null : nbDays },
    {
      where: {
        id: owner.id,
      },
    }
  );

  if (affectedCount === 0) {
    return new Err(new Error("Workspace not found."));
  }

  return new Ok(undefined);
}

export async function disableSSOEnforcement(
  owner: LightWorkspaceType
): Promise<Result<void, Error>> {
  const [affectedCount] = await Workspace.update(
    { ssoEnforced: false },
    {
      where: {
        id: owner.id,
        ssoEnforced: true,
      },
    }
  );

  if (affectedCount === 0) {
    return new Err(new Error("SSO enforcement is already disabled."));
  }

  return new Ok(undefined);
}

interface WorkspaceMetadata {
  maintenance?: "relocation" | "relocation-done";
}

export async function updateWorkspaceMetadata(
  owner: LightWorkspaceType,
  metadata: WorkspaceMetadata
): Promise<Result<void, Error>> {
  const previousMetadata = owner.metadata || {};
  const newMetadata = { ...previousMetadata, ...metadata };
  const [affectedCount] = await Workspace.update(
    { metadata: newMetadata },
    {
      where: {
        id: owner.id,
      },
    }
  );

  if (affectedCount === 0) {
    return new Err(new Error("Workspace not found."));
  }

  return new Ok(undefined);
}

export async function setWorkspaceRelocating(
  owner: LightWorkspaceType
): Promise<Result<void, Error>> {
  return updateWorkspaceMetadata(owner, { maintenance: "relocation" });
}

export async function setWorkspaceRelocated(
  owner: LightWorkspaceType
): Promise<Result<void, Error>> {
  return updateWorkspaceMetadata(owner, { maintenance: "relocation-done" });
}

export async function updateExtensionConfiguration(
  auth: Authenticator,
  blacklistedDomains: string[]
): Promise<Result<void, Error>> {
  const config = await ExtensionConfigurationResource.fetchForWorkspace(auth);

  if (config) {
    await config.updateBlacklistedDomains(auth, { blacklistedDomains });
  } else {
    await ExtensionConfigurationResource.makeNew(
      { blacklistedDomains },
      auth.getNonNullableWorkspace().id
    );
  }

  return new Ok(undefined);
}

export async function upgradeWorkspaceToBusinessPlan(
  auth: Authenticator,
  workspace: LightWorkspaceType
): Promise<Result<void, Error>> {
  if (!auth.isDustSuperUser()) {
    throw new Error("Cannot upgrade workspace to plan: not allowed.");
  }

  const subscription = await Subscription.findOne({
    where: { workspaceId: workspace.id, status: "active" },
    include: ["plan"],
  });
  if (subscription) {
    return new Err(new Error("Workspace already has an active subscription."));
  }

  // Check if already fully on business plan with both metadata and subscription correct.
  if (workspace.metadata?.isBusiness === true) {
    return new Err(new Error("Workspace is already on business plan."));
  }

  await Workspace.update(
    {
      metadata: {
        ...workspace.metadata,
        isBusiness: true,
      },
    },
    {
      where: { sId: workspace.sId },
    }
  );

  return new Ok(undefined);
}
