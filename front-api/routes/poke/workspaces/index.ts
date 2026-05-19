import { Hono } from "hono";
import type { FindOptions, Order, WhereOptions } from "sequelize";
import { Op } from "sequelize";

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

import { apiError } from "@front-api/middleware/utils";

// Mounted at /api/poke/workspaces. pokeAuth is applied by the parent poke
// sub-app. Note: this is the workspace LIST endpoint only; the workspace
// sub-app at /api/poke/workspaces/:wId/... will be migrated separately with
// its own workspace-scoped auth middleware.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const upgradedQuery = c.req.query("upgraded");
  const searchQuery = c.req.query("search");
  const limitQuery = c.req.query("limit");

  let listUpgraded: boolean | undefined;
  const searchTerm = searchQuery
    ? decodeURIComponent(searchQuery).trim()
    : undefined;
  let limit = 0;
  let originalLimit = 0;
  const order: Order = [["createdAt", "DESC"]];

  if (upgradedQuery !== undefined) {
    if (!["true", "false"].includes(upgradedQuery)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The request query is invalid, expects { upgraded: boolean }.",
        },
      });
    }

    listUpgraded = upgradedQuery === "true";
  }

  if (limitQuery !== undefined) {
    if (!/^\d+$/.test(limitQuery)) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The request query is invalid, expects { limit: number }.",
        },
      });
    }

    originalLimit = parseInt(limitQuery, 10);
    limit = originalLimit;
  }

  const conditions: WhereOptions<WorkspaceModel>[] = [];

  if (listUpgraded !== undefined) {
    const subscriptions =
      await SubscriptionResource.internalListAllActiveNoFreeTestPlan();
    const workspaceIds = subscriptions.map((s) => s.workspaceId);
    if (listUpgraded) {
      conditions.push({
        id: {
          [Op.in]: workspaceIds,
        },
      });
    } else {
      conditions.push({
        id: {
          [Op.notIn]: workspaceIds,
        },
      });
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
        conditions.push({
          id: subscription.workspaceId,
        });
      }
    }

    let isSearchByEmail = false;
    if (isEmailValid(searchTerm)) {
      // We can have 2 users with the same email if a Google user and a Github
      // user have the same email.
      const users = await UserResource.listByEmail(searchTerm);
      if (users.length) {
        const { memberships, total } =
          await MembershipResource.getLatestMemberships({
            users,
          });
        if (total > 0) {
          conditions.push({
            id: {
              [Op.in]: memberships.map((m) => m.workspaceId),
            },
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
        conditions.push({
          id: workspace.id,
        });
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
        conditions.push({
          id: workspaceModelId,
        });
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
          {
            sId: {
              [Op.iLike]: `%${searchTerm}%`,
            },
          },
          {
            name: {
              [Op.iLike]: `%${searchTerm}%`,
            },
          },
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
    ? {
        [Op.and]: conditions,
      }
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
        include: [
          {
            model: PlanModel,
            as: "plan",
          },
        ],
      },
    ],
    order,
  });

  // If limit is above originalLimit, sort manually and then return only the
  // first originalLimit items.
  let displayedWorkspaces = workspaces;
  if (limit > originalLimit) {
    // Order by plan, entreprise first, then pro, then free and old free using
    // isEntreprisePlan, isProPlan, isFreePlan, isOldFreePlan helpers.
    const sorted = [...workspaces].sort((a, b) => {
      // Note: TypeScript may incorrectly assume that `subscriptions` is
      // always defined. Using optional chaining and default values to handle
      // potential undefined cases.
      const planAPriority = getPlanCodeSortPriority(
        a.subscriptions?.[0]?.plan?.code || ""
      );
      const planBPriority = getPlanCodeSortPriority(
        b.subscriptions?.[0]?.plan?.code || ""
      );

      return planAPriority - planBPriority;
    });

    displayedWorkspaces = sorted.slice(0, originalLimit);
  }

  const lightWorkspaces = displayedWorkspaces.map((workspace) =>
    renderLightWorkspaceType({ workspace, role: "admin" })
  );
  const membersCountByWorkspaceId =
    await MembershipResource.getMembersCountsForWorkspaces(auth, {
      workspaces: lightWorkspaces,
      activeOnly: true,
    });

  return c.json({
    workspaces: displayedWorkspaces.map((workspace) => ({
      ...renderLightWorkspaceType({
        workspace,
        role: "admin",
      }),
      createdAt: workspace.createdAt.toISOString(),
      subscription: renderSubscriptionFromModels({
        plan: workspace.subscriptions[0]
          ? workspace.subscriptions[0].plan
          : // If there is no active subscription, we use the free plan data.
            FREE_NO_PLAN_DATA,
        activeSubscription: workspace.subscriptions[0],
      }),
      membersCount: membersCountByWorkspaceId[workspace.sId] ?? 0,
    })),
  });
});

export default app;
