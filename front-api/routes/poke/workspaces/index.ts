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
import logger from "@app/logger/logger";
import type { SubscriptionType } from "@app/types/plan";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";
import type { FindOptions, Order, WhereOptions } from "sequelize";
import { Op } from "sequelize";

import wId from "./[wId]";

export type PokeWorkspaceType = LightWorkspaceType & {
  createdAt: string;
  subscription: SubscriptionType;
  membersCount: number;
};

export type GetPokeWorkspacesResponseBody = {
  workspaces: PokeWorkspaceType[];
};

// Note: the parent poke/index.ts already applies pokeAuth (super-user gate).
// This sub-router handles the workspace LIST endpoint (GET /) and mounts the
// per-workspace [wId] sub-app (which adds workspace resolution on top via
// pokeWorkspaceAuth).
const app = new Hono();

app.get("/", async (ctx): HandlerResult<GetPokeWorkspacesResponseBody> => {
  const auth = ctx.get("auth");
  const upgradedQuery = ctx.req.query("upgraded");
  const searchQuery = ctx.req.query("search");
  const limitQuery = ctx.req.query("limit");

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

  let originalLimit = 0;
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
    originalLimit = parseInt(limitQuery, 10);
    limit = originalLimit;
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
  });
});

app.route("/:wId", wId);

export default app;
