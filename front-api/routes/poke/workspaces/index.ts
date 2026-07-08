import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import type { PokePlanTypeFilter } from "@app/lib/plans/plan_codes";
import {
  getPokePlanTypeFilter,
  isPokePlanTypeFilter,
  POKE_PLAN_TYPE_FILTERS,
} from "@app/lib/plans/plan_codes";
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
import logger from "@app/logger/logger";
import type { GetPokeWorkspacesResponseBody } from "@app/types/api/poke/workspaces";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { FindOptions, Order, WhereOptions } from "sequelize";
import { Op } from "sequelize";

import wId from "./[wId]";

export type {
  GetPokeWorkspacesResponseBody,
  PokeWorkspaceType,
} from "@app/types/api/poke/workspaces";

// Note: the parent poke/index.ts already applies pokeAuth (super-user gate).
// This sub-router handles the workspace LIST endpoint (GET /) and mounts the
// per-workspace [wId] sub-app (which adds workspace resolution on top via
// pokeAuth).
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetPokeWorkspacesResponseBody> => {
  const auth = ctx.get("auth");
  const upgradedQuery = ctx.req.query("upgraded");
  const searchQuery = ctx.req.query("search");
  const limitQuery = ctx.req.query("limit");
  const offsetQuery = ctx.req.query("offset");
  const planTypeQuery = ctx.req.query("planType");

  let listUpgraded: boolean | undefined;
  if (upgradedQuery !== undefined) {
    if (!["true", "false"].includes(upgradedQuery)) {
      return apiError(ctx, {
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

  let planTypeFilter: PokePlanTypeFilter | undefined;
  if (planTypeQuery !== undefined) {
    if (!isPokePlanTypeFilter(planTypeQuery)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `The request query is invalid, expects { planType: one of ${POKE_PLAN_TYPE_FILTERS.join(", ")} }.`,
        },
      });
    }
    planTypeFilter = planTypeQuery;
  }

  let limit = 0;
  if (limitQuery !== undefined) {
    if (!/^\d+$/.test(limitQuery)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The request query is invalid, expects { limit: number }.",
        },
      });
    }
    limit = parseInt(limitQuery, 10);
  }

  let offset = 0;
  if (offsetQuery !== undefined) {
    if (!/^\d+$/.test(offsetQuery)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The request query is invalid, expects { offset: number }.",
        },
      });
    }
    offset = parseInt(offsetQuery, 10);
  }

  const searchTerm = searchQuery
    ? decodeURIComponent(searchQuery).trim()
    : undefined;

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
    // Phone-number search is one of several axes (sId / Stripe sub / email /
    // domain / phone). Production is fine (front-api's esbuild config bundles
    // `libphonenumber-js` inline), but the front-api dev runtime (tsx) can
    // still hit the CJS metadata interop issue. Degrade gracefully so the
    // other axes keep working in dev.
    try {
      const e164PhoneNumber = tryParsePhoneNumber(searchTerm);
      if (e164PhoneNumber) {
        const workspaceModelId =
          await WorkspaceVerificationAttemptResource.findWorkspaceModelIdFromPhoneNumber(
            e164PhoneNumber
          );
        if (workspaceModelId) {
          isSearchByPhone = true;
          conditions.push({ id: workspaceModelId });
        }
      }
    } catch (err) {
      logger.warn(
        { err: normalizeError(err) },
        "Phone number parsing unavailable; skipping phone-search axis"
      );
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
  }

  // Plan-type filtering happens in JS below (a workspace's plan type can
  // depend on there being no active subscription at all, which SQL can't
  // express against this over-fetched set), so we can't rely on SQL
  // LIMIT/OFFSET to select the right page in that case: we over-fetch a
  // wide candidate set from offset 0, filter it in JS, then slice out the
  // requested page ourselves. Otherwise (plain pagination, no plan-type
  // filter) we paginate directly in SQL. Either way we fetch one extra row
  // past the requested page so we can tell whether a next page exists
  // without a second query.
  const needsOverFetch = planTypeFilter !== undefined;
  const fetchLimit = needsOverFetch
    ? Math.max(100, offset + limit + 1)
    : limit + 1;
  const fetchOffset = needsOverFetch ? 0 : offset;

  const where: FindOptions<WorkspaceModel>["where"] = conditions.length
    ? { [Op.and]: conditions }
    : {};

  const workspaces = await WorkspaceModel.findAll({
    where,
    limit: fetchLimit,
    offset: fetchOffset,
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

  let displayed = workspaces;
  if (planTypeFilter) {
    displayed = displayed.filter((workspace) => {
      const planCode = workspace.subscriptions[0]
        ? workspace.subscriptions[0].plan.code
        : FREE_NO_PLAN_DATA.code;
      return getPokePlanTypeFilter(planCode) === planTypeFilter;
    });
  }

  const pageStart = needsOverFetch ? offset : 0;
  const hasMore = displayed.length > pageStart + limit;
  displayed = displayed.slice(pageStart, pageStart + limit);

  const lightWorkspaces = displayed.map((workspace) =>
    renderLightWorkspaceType({ workspace, role: "admin" })
  );
  const membersCountByWorkspaceId =
    await MembershipResource.getMembersCountsForWorkspaces(auth, {
      workspaces: lightWorkspaces,
      activeOnly: true,
    });

  return ctx.json({
    workspaces: displayed.map((workspace) => ({
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
    })),
    hasMore,
  });
});

app.route("/:wId", wId);

export default app;
