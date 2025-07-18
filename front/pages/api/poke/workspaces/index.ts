import type { NextApiRequest, NextApiResponse } from "next";
import type { FindOptions, Order, WhereOptions } from "sequelize";
import { Op } from "sequelize";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getWorkspaceVerifiedDomains } from "@app/lib/api/workspace_domains";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { Plan, Subscription } from "@app/lib/models/plan";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import {
  isEntreprisePlan,
  isFreePlan,
  isFriendsAndFamilyPlan,
  isOldFreePlan,
  isProPlan,
} from "@app/lib/plans/plan_codes";
import { renderSubscriptionFromModels } from "@app/lib/plans/renderers";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { isDomain, isEmailValid } from "@app/lib/utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { apiError } from "@app/logger/withlogging";
import type {
  LightWorkspaceType,
  MembershipRoleType,
  SubscriptionType,
  WithAPIErrorResponse,
  WorkspaceDomain,
} from "@app/types";

export type PokeWorkspaceType = LightWorkspaceType & {
  createdAt: string;
  subscription: SubscriptionType;
  adminEmail: string | null;
  membersCount: number;
  dataSourcesCount: number;
  workspaceDomains: WorkspaceDomain[];
};

export type GetPokeWorkspacesResponseBody = {
  workspaces: PokeWorkspaceType[];
};

const getPlanPriority = (planCode: string) => {
  if (isEntreprisePlan(planCode)) {
    return 1;
  }

  if (isFriendsAndFamilyPlan(planCode)) {
    return 2;
  }

  if (isProPlan(planCode)) {
    return 3;
  }

  if (isFreePlan(planCode)) {
    return 4;
  }

  if (isOldFreePlan(planCode)) {
    return 5;
  }

  return 6;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPokeWorkspacesResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      let listUpgraded: boolean | undefined;
      const searchTerm = req.query.search
        ? decodeURIComponent(req.query.search as string).trim()
        : undefined;
      let limit: number = 0;
      let originalLimit: number = 0;
      const order: Order = [["createdAt", "DESC"]];

      if (req.query.upgraded !== undefined) {
        if (
          typeof req.query.upgraded !== "string" ||
          !["true", "false"].includes(req.query.upgraded)
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The request query is invalid, expects { upgraded: boolean }.",
            },
          });
        }

        listUpgraded = req.query.upgraded === "true";
      }

      if (searchTerm !== undefined && typeof searchTerm !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request query is invalid, expects { search: string }.",
          },
        });
      }

      if (req.query.limit !== undefined) {
        if (
          typeof req.query.limit !== "string" ||
          !/^\d+$/.test(req.query.limit)
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The request query is invalid, expects { limit: number }.",
            },
          });
        }

        originalLimit = parseInt(req.query.limit, 10);
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
        let isSearchByEmail = false;
        if (isEmailValid(searchTerm)) {
          // We can have 2 users with the same email if a Google user and a Github user have the same email.
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
          const workspaceDomain = await WorkspaceHasDomainModel.findOne({
            where: { domain: searchTerm },
          });

          if (workspaceDomain) {
            isSearchByDomain = true;
            conditions.push({
              id: workspaceDomain.workspaceId,
            });
          }
        }

        if (!isSearchByEmail && !isSearchByDomain) {
          conditions.push({
            [Op.or]: [
              {
                sId: {
                  [Op.iLike]: `${searchTerm}%`,
                },
              },
              {
                name: {
                  [Op.iLike]: `${searchTerm}%`,
                },
              },
            ],
          });
        }

        // In case of search, we increase the limit for the sql query to 100 because we'll sort manually (until a better solution is found).
        // Note from seb: I tried ordering directly in the query but I stumbled into sequelize behaviors that I don't understand.
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
            model: Subscription,
            as: "subscriptions",
            where: { status: "active" },
            required: false,
            include: [
              {
                model: Plan,
                as: "plan",
              },
            ],
          },
        ],
        order,
      });

      // If limit is above originalLimit, sort manually and then splice.
      if (limit > originalLimit) {
        // Order by plan, entreprise first, then pro, then free and old free using isEntreprisePlan,
        // isProPlan and isFreePlan, isOldFreePlan methods.
        workspaces.sort((a, b) => {
          // Note: TypeScript may incorrectly assume that `subscriptions` is always defined.
          // Using optional chaining and default values to handle potential undefined cases.
          const planAPriority = getPlanPriority(
            a.subscriptions?.[0]?.plan?.code || ""
          );
          const planBPriority = getPlanPriority(
            b.subscriptions?.[0]?.plan?.code || ""
          );

          return planAPriority - planBPriority;
        });

        workspaces.splice(originalLimit);
      }

      return res.status(200).json({
        workspaces: await Promise.all(
          workspaces.map(async (ws): Promise<PokeWorkspaceType> => {
            // Note: TypeScript may incorrectly assume that `subscriptions` is always defined.
            const [activeSubscription] = ws.subscriptions;

            const subscription: SubscriptionType = renderSubscriptionFromModels(
              {
                plan: activeSubscription
                  ? activeSubscription.plan
                  : // If there is no active subscription, we use the free plan data.
                    FREE_NO_PLAN_DATA,
                activeSubscription: activeSubscription,
              }
            );

            const lightWorkspace = renderLightWorkspaceType({
              workspace: ws,
              role: "admin",
            });

            const auth = await Authenticator.internalAdminForWorkspace(ws.sId);
            const dataSources = await DataSourceResource.listByWorkspace(auth);
            const dataSourcesCount = dataSources.length;

            const { memberships: admins, total } =
              await MembershipResource.getActiveMemberships({
                workspace: lightWorkspace,
                roles: ["admin" as MembershipRoleType],
              });

            const firstAdmin = total
              ? await UserResource.fetchByModelId(
                  admins.sort(
                    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
                  )[0].userId
                )
              : null;

            const membersCount =
              await MembershipResource.getMembersCountForWorkspace({
                workspace: lightWorkspace,
                activeOnly: true,
              });

            const verifiedDomains =
              await getWorkspaceVerifiedDomains(lightWorkspace);

            return {
              ...lightWorkspace,
              createdAt: ws.createdAt.toISOString(),
              subscription,
              adminEmail: firstAdmin?.email ?? null,
              membersCount,
              dataSourcesCount,
              workspaceDomains: verifiedDomains,
            };
          })
        ),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
