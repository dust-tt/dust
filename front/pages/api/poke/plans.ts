import type { PlanType, WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { Plan } from "@app/lib/models/plan";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { apiError } from "@app/logger/withlogging";

export const PlanTypeSchema = t.type({
  code: t.string,
  name: t.string,
  limits: t.type({
    assistant: t.type({
      isSlackBotAllowed: t.boolean,
      maxMessages: t.number,
      maxMessagesTimeframe: t.union([t.literal("day"), t.literal("lifetime")]),
    }),
    connections: t.type({
      isConfluenceAllowed: t.boolean,
      isSlackAllowed: t.boolean,
      isNotionAllowed: t.boolean,
      isGoogleDriveAllowed: t.boolean,
      isGithubAllowed: t.boolean,
      isIntercomAllowed: t.boolean,
      isWebCrawlerAllowed: t.boolean,
    }),
    dataSources: t.type({
      count: t.number,
      documents: t.type({
        count: t.number,
        sizeMb: t.number,
      }),
    }),
    users: t.type({
      maxUsers: t.number,
    }),
    vaults: t.type({
      maxVaults: t.number,
    }),
    canUseProduct: t.boolean,
  }),
  trialPeriodDays: t.number,
});

export type UpsertPokePlanResponseBody = {
  plan: PlanType;
};

export type GetPokePlansResponseBody = {
  plans: PlanType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetPokePlansResponseBody | UpsertPokePlanResponseBody>
  >
): Promise<void> {
  const session = await getSession(req, res);
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
      const planModels = await Plan.findAll({ order: [["createdAt", "ASC"]] });
      const plans: PlanType[] = planModels.map((plan) =>
        renderPlanFromModel({ plan })
      );

      res.status(200).json({
        plans,
      });
      return;

    case "POST":
      const bodyValidation = PlanTypeSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }
      const body = bodyValidation.right;

      await Plan.upsert({
        code: body.code,
        name: body.name,
        isSlackbotAllowed: body.limits.assistant.isSlackBotAllowed,
        maxMessages: body.limits.assistant.maxMessages,
        maxMessagesTimeframe: body.limits.assistant.maxMessagesTimeframe,
        isManagedConfluenceAllowed: body.limits.connections.isConfluenceAllowed,
        isManagedSlackAllowed: body.limits.connections.isSlackAllowed,
        isManagedNotionAllowed: body.limits.connections.isNotionAllowed,
        isManagedGoogleDriveAllowed:
          body.limits.connections.isGoogleDriveAllowed,
        isManagedGithubAllowed: body.limits.connections.isGithubAllowed,
        isManagedIntercomAllowed: body.limits.connections.isIntercomAllowed,
        isManagedWebCrawlerAllowed: body.limits.connections.isWebCrawlerAllowed,
        maxDataSourcesCount: body.limits.dataSources.count,
        maxDataSourcesDocumentsCount: body.limits.dataSources.documents.count,
        maxDataSourcesDocumentsSizeMb: body.limits.dataSources.documents.sizeMb,
        maxUsersInWorkspace: body.limits.users.maxUsers,
        maxVaultsInWorkspace: body.limits.vaults.maxVaults,
        trialPeriodDays: body.trialPeriodDays,
        canUseProduct: body.limits.canUseProduct,
      });
      res.status(200).json({
        plan: body,
      });
      break;

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

export default withSessionAuthentication(handler);
