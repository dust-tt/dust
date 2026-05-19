import type { Authenticator } from "@app/lib/auth";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import { getPlanCodeSortPriority } from "@app/lib/plans/plan_codes";
import { renderSubscriptionFromModels } from "@app/lib/plans/renderers";
import { tryParsePhoneNumber } from "@app/lib/plans/trial/phone";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { isDomain, isEmailValid } from "@app/lib/utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import type { FindOptions, Order, WhereOptions } from "sequelize";
import { Op } from "sequelize";

export type PokeWorkspaceType = LightWorkspaceType & {
  createdAt: string;
  subscription: SubscriptionType;
  membersCount: number;
};

export interface ListWorkspacesForPokeParams {
  listUpgraded?: boolean;
  searchTerm?: string;
  limit: number;
}

/**
 * Search-and-list workspaces for the poke admin UI: resolves an optional
 * search term against several axes (Stripe sub id, email, domain, phone)
 * before falling back to sId/name iLike, then enriches each row with its
 * active subscription and member count.
 *
 * When a search is active, the query fetches up to 100 rows so we can
 * sort by plan priority client-side and trim back to `limit` (Sequelize
 * ordering didn't behave as expected — see seb's note in git history).
 */
export async function listWorkspacesForPoke(
  auth: Authenticator,
  {
    listUpgraded,
    searchTerm,
    limit: requestedLimit,
  }: ListWorkspacesForPokeParams
): Promise<PokeWorkspaceType[]> {
  const originalLimit = requestedLimit;
  let limit = requestedLimit;
  const order: Order = [["createdAt", "DESC"]];
  const conditions: WhereOptions<WorkspaceModel>[] = [];

  if (listUpgraded !== undefined) {
    const subscriptions =
      await SubscriptionResource.internalListAllActiveNoFreeTestPlan();
    const workspaceIds = subscriptions.map((s) => s.workspaceId);
    if (listUpgraded) {
      conditions.push({ id: { [Op.in]: workspaceIds } });
    } else {
      conditions.push({ id: { [Op.notIn]: workspaceIds } });
    }
  }

  if (searchTerm) {
    // Search by Stripe subscription ID (exact match).
    let isSearchByStripeSubscription = false;
    if (searchTerm.startsWith("sub_")) {
      const subscription =
        await SubscriptionResource.fetchByStripeId(searchTerm);
      if (subscription) {
        isSearchByStripeSubscription = true;
        conditions.push({ id: subscription.workspaceId });
      }
    }

    let isSearchByEmail = false;
    if (isEmailValid(searchTerm)) {
      // We can have 2 users with the same email if a Google user and a Github
      // user have the same email.
      const users = await UserResource.listByEmail(searchTerm);
      if (users.length) {
        const { memberships, total } =
          await MembershipResource.getLatestMemberships({ users });
        if (total > 0) {
          conditions.push({
            id: { [Op.in]: memberships.map((m) => m.workspaceId) },
          });
          isSearchByEmail = true;
        }
      }
    }

    let isSearchByDomain = false;
    if (isDomain(searchTerm)) {
      const workspace = await WorkspaceResource.fetchByDomain(searchTerm);
      if (workspace) {
        isSearchByDomain = true;
        conditions.push({ id: workspace.id });
      }
    }

    let isSearchByPhone = false;
    const e164 = tryParsePhoneNumber(searchTerm);
    if (e164) {
      const workspaceModelId =
        await WorkspaceVerificationAttemptResource.findWorkspaceModelIdFromPhoneNumber(
          e164
        );
      if (workspaceModelId) {
        isSearchByPhone = true;
        conditions.push({ id: workspaceModelId });
      }
    }

    if (
      !isSearchByEmail &&
      !isSearchByDomain &&
      !isSearchByStripeSubscription &&
      !isSearchByPhone
    ) {
      conditions.push({
        [Op.or]: [
          { sId: { [Op.iLike]: `%${searchTerm}%` } },
          { name: { [Op.iLike]: `%${searchTerm}%` } },
        ],
      });
    }

    // In case of search, we increase the limit for the sql query to 100
    // because we'll sort manually (until a better solution is found).
    // Note from seb: I tried ordering directly in the query but I stumbled
    // into sequelize behaviors that I don't understand.
    limit = 100;
  }

  const where: FindOptions<WorkspaceModel>["where"] = conditions.length
    ? { [Op.and]: conditions }
    : {};

  const workspaces = await WorkspaceModel.findAll({
    where,
    limit,
    include: [
      {
        model: SubscriptionModel,
        as: "subscriptions",
        where: { status: "active" },
        required: false,
        include: [{ model: PlanModel, as: "plan" }],
      },
    ],
    order,
  });

  // If limit was bumped above originalLimit, sort by plan priority
  // (enterprise first, then pro, then free / old-free) and trim back.
  let displayed = workspaces;
  if (limit > originalLimit) {
    const sorted = [...workspaces].sort((a, b) => {
      const planAPriority = getPlanCodeSortPriority(
        a.subscriptions?.[0]?.plan?.code || ""
      );
      const planBPriority = getPlanCodeSortPriority(
        b.subscriptions?.[0]?.plan?.code || ""
      );
      return planAPriority - planBPriority;
    });
    displayed = sorted.slice(0, originalLimit);
  }

  const lightWorkspaces = displayed.map((workspace) =>
    renderLightWorkspaceType({ workspace, role: "admin" })
  );
  const membersCountByWorkspaceId =
    await MembershipResource.getMembersCountsForWorkspaces(auth, {
      workspaces: lightWorkspaces,
      activeOnly: true,
    });

  return displayed.map((workspace) => ({
    ...renderLightWorkspaceType({ workspace, role: "admin" }),
    createdAt: workspace.createdAt.toISOString(),
    subscription: renderSubscriptionFromModels({
      plan: workspace.subscriptions[0]
        ? workspace.subscriptions[0].plan
        : // If there is no active subscription, we use the free plan data.
          FREE_NO_PLAN_DATA,
      activeSubscription: workspace.subscriptions[0],
    }),
    membersCount: membersCountByWorkspaceId[workspace.sId] ?? 0,
  }));
}
