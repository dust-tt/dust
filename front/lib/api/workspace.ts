import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { Plan, Subscription } from "@app/lib/models/plan";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { getUsageToReportForSubscriptionItem } from "@app/lib/plans/usage";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import { REPORT_USAGE_METADATA_KEY } from "@app/lib/plans/usage/types";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import type { MembershipsPaginationParams } from "@app/lib/resources/membership_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import type { SearchMembersPaginationParams } from "@app/lib/resources/user_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchDeleteWorkspaceWorkflow } from "@app/poke/temporal/client";
import type {
  GroupKind,
  LightWorkspaceType,
  MembershipOriginType,
  MembershipRoleType,
  PublicAPILimitsType,
  Result,
  RoleType,
  SubscriptionType,
  UserTypeWithWorkspace,
  UserTypeWithWorkspaces,
  WorkspaceSegmentationType,
  WorkspaceType,
} from "@app/types";
import {
  ACTIVE_ROLES,
  assertNever,
  Err,
  md5,
  Ok,
  removeNulls,
} from "@app/types";

import { GroupResource } from "../resources/group_resource";
import { frontSequelize } from "../resources/storage";

export async function getWorkspaceInfos(
  wId: string
): Promise<LightWorkspaceType | null> {
  const workspace = await WorkspaceResource.fetchById(wId);

  if (!workspace) {
    return null;
  }

  return renderLightWorkspaceType({ workspace });
}

export async function removeAllWorkspaceDomains(
  workspace: LightWorkspaceType
): Promise<void> {
  await WorkspaceHasDomainModel.destroy({
    where: {
      workspaceId: workspace.id,
    },
  });
}

export async function getWorkspaceCreationDate(
  workspaceId: string
): Promise<Date> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);

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

  const workspace = await WorkspaceResource.fetchByModelId(owner.id);

  if (!workspace) {
    throw new Error("Could not find workspace.");
  }

  await workspace.updateSegmentation(segmentation);

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
    transaction,
  }: {
    roles?: MembershipRoleType[];
    activeOnly?: boolean;
    transaction?: Transaction;
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
        transaction,
      })
    : await MembershipResource.getLatestMemberships({
        workspace: owner,
        roles,
        paginationParams,
        transaction,
      });

  const usersWithWorkspaces = await Promise.all(
    memberships.map(async (m) => {
      let role = "none" as RoleType;
      let origin: MembershipOriginType | undefined = undefined;
      if (!m.isRevoked()) {
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
      origin = m.origin;

      let user: UserResource | null;
      if (!m.user) {
        user = await UserResource.fetchByModelId(m.userId, transaction);
      } else {
        user = new UserResource(UserModel, m.user);
      }

      if (!user) {
        return null;
      }

      return {
        ...user.toJSON(),
        workspaces: [{ ...owner, role, flags: null }],
        origin,
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
    groupKind?: Omit<GroupKind, "system">;
  },
  paginationParams: SearchMembersPaginationParams
): Promise<{ members: UserTypeWithWorkspace[]; total: number }> {
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

  const usersWithWorkspace = await Promise.all(
    users.map(async (u) => {
      const [m] = u.memberships ?? [];
      let role: RoleType = "none";
      let groups: string[] | undefined;
      let origin: MembershipOriginType | undefined = undefined;

      if (m) {
        const membership = new MembershipResource(
          MembershipResource.model,
          m.get()
        );

        role = !membership.isRevoked()
          ? ACTIVE_ROLES.includes(membership.role)
            ? membership.role
            : "none"
          : "none";

        origin = membership.origin;
      }

      if (options.groupKind) {
        const groupsResult = await GroupResource.listUserGroupsInWorkspace({
          user: u,
          workspace: owner,
          groupKinds: [options.groupKind],
        });

        groups = groupsResult.map((g) => g.toJSON()).map((g) => g.name);
      }

      return {
        ...u.toJSON(),
        workspace: { ...owner, role, groups, flags: null },
        origin,
      };
    })
  );

  return { members: usersWithWorkspace, total };
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
  workspace: WorkspaceType | WorkspaceModel,
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
  const workspaces = await WorkspaceResource.fetchByModelIds(modelIds);
  return workspaces.map((w) => renderLightWorkspaceType({ workspace: w }));
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
  owner: LightWorkspaceType,
  {
    workspaceHasBeenRelocated = false,
  }: { workspaceHasBeenRelocated?: boolean } = {}
): Promise<Result<void, Error>> {
  // If the workspace has not been relocated, we expect all subscriptions to be canceled.
  if (!workspaceHasBeenRelocated) {
    const allSubscriptionsCanceled = await areAllSubscriptionsCanceled(owner);
    if (!allSubscriptionsCanceled) {
      return new Err(
        new Error(
          "The workspace cannot be deleted because there are active subscriptions."
        )
      );
    }
  }

  const res = await launchDeleteWorkspaceWorkflow({
    workspaceId: owner.sId,
    workspaceHasBeenRelocated,
  });

  if (res.isErr()) {
    return new Err(res.error);
  }

  return new Ok(undefined);
}

export interface WorkspaceMetadata {
  maintenance?: "relocation" | "relocation-done";
  publicApiLimits?: PublicAPILimitsType;
  allowContentCreationFileSharing?: boolean;
  allowVoiceTranscription?: boolean;
}

export async function updateWorkspaceMetadata(
  owner: LightWorkspaceType,
  metadata: WorkspaceMetadata
): Promise<Result<void, Error>> {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const previousMetadata = owner.metadata || {};
  const newMetadata = { ...previousMetadata, ...metadata };
  return WorkspaceResource.updateMetadata(owner.id, newMetadata);
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

export function isWorkspaceRelocationOngoing(
  owner: LightWorkspaceType
): boolean {
  return owner.metadata?.maintenance === "relocation";
}

export function isWorkspaceRelocationDone(owner: LightWorkspaceType): boolean {
  return owner.metadata?.maintenance === "relocation-done";
}

export function getWorkspacePublicAPILimits(
  owner: LightWorkspaceType
): PublicAPILimitsType | null {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return owner.metadata?.publicApiLimits || null;
}

export async function setWorkspacePublicAPILimits(
  owner: LightWorkspaceType,
  limits: PublicAPILimitsType
): Promise<Result<void, Error>> {
  return updateWorkspaceMetadata(owner, { publicApiLimits: limits });
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

  return WorkspaceResource.updateMetadata(workspace.id, {
    ...workspace.metadata,
    isBusiness: true,
  });
}

export async function checkSeatCountForWorkspace(
  workspace: LightWorkspaceType
): Promise<Result<string, Error>> {
  const subscription = await Subscription.findOne({
    where: {
      workspaceId: workspace.id,
      status: "active",
    },
    include: [Plan],
  });
  if (!subscription) {
    return new Err(new Error("Workspace has no active subscription."));
  }
  if (!subscription.stripeSubscriptionId) {
    return new Err(new Error("No Stripe subscription ID found."));
  }

  const stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );
  if (!stripeSubscription) {
    return new Err(
      new Error(
        `Cannot check usage in subscription: Stripe subscription ${subscription.stripeSubscriptionId} not found.`
      )
    );
  }
  const { data: subscriptionItems } = stripeSubscription.items;

  const activeSeats = await countActiveSeatsInWorkspace(workspace.sId);

  for (const item of subscriptionItems) {
    const usageToReportRes = getUsageToReportForSubscriptionItem(item);
    if (usageToReportRes.isErr()) {
      return new Err(usageToReportRes.error);
    }

    const usageToReport = usageToReportRes.value;
    if (!usageToReport) {
      continue;
    }

    switch (usageToReport) {
      case "FIXED":
      case "MAU_1":
      case "MAU_5":
      case "MAU_10":
        return new Err(new Error("Subscription is not PER_SEAT-based."));
      case "PER_SEAT":
        const currentQuantity = item.quantity;

        if (currentQuantity !== activeSeats) {
          return new Err(
            new Error(
              `Incorrect quantity on Stripe: ${currentQuantity}, correct value: ${activeSeats}.`
            )
          );
        }
        break;

      default:
        assertNever(usageToReport);
    }
    return new Ok(`Correctly found ${activeSeats} active seats on Stripe.`);
  }
  return new Err(new Error(`${REPORT_USAGE_METADATA_KEY} metadata not found.`));
}

/**
 * Advisory lock to be used in admin related request on workspace
 *
 * To avoid deadlocks when using Postgresql advisory locks, please make sure to not issue any other
 * SQL query outside of the transaction `t` that is holding the lock.
 * Otherwise, the other query will be competing for a connection in the database connection pool,
 * resulting in a potential deadlock when the pool is fully occupied.
 */
export async function getWorkspaceAdministrationVersionLock(
  workspace: WorkspaceType,
  t: Transaction
) {
  const now = new Date();

  const hash = md5(`workspace_administration_${workspace.id}`);
  const lockKey = parseInt(hash, 16) % 9999999999;
  // OK because we need to setup a lock
  // eslint-disable-next-line dust/no-raw-sql
  await frontSequelize.query("SELECT pg_advisory_xact_lock(:key)", {
    transaction: t,
    replacements: { key: lockKey },
  });

  logger.info(
    {
      workspaceId: workspace.id,
      duration: new Date().getTime() - now.getTime(),
      lockKey,
    },
    "[WORKSPACE_TRACE] Advisory lock acquired"
  );
}

export async function findWorkspaceByWorkOSOrganizationId(
  workOSOrganizationId: string
): Promise<LightWorkspaceType | null> {
  const workspace =
    await WorkspaceResource.fetchByWorkOSOrganizationId(workOSOrganizationId);

  if (!workspace) {
    return null;
  }

  return renderLightWorkspaceType({ workspace });
}
