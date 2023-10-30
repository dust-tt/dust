import * as t from "io-ts";
import { NextApiRequest, NextApiResponse } from "next";

import { getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Plan } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";

export const PokePlanTypeSchema = t.type({
  code: t.string,
  name: t.string,
  limits: t.type({
    assistant: t.type({
      isSlackBotAllowed: t.boolean,
      maxMessages: t.number,
    }),
    connections: t.type({
      isSlackAllowed: t.boolean,
      isNotionAllowed: t.boolean,
      isGoogleDriveAllowed: t.boolean,
      isGithubAllowed: t.boolean,
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
  }),
  stripeProductId: t.union([t.string, t.null]),
});

export type PokePlanType = t.TypeOf<typeof PokePlanTypeSchema>;

export type GetPokePlansResponseBody = {
  plans: PokePlanType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetPokePlansResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const user = await getUserFromSession(session);

  if (!user || !user.isDustSuperUser) {
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
      const planModels = await Plan.findAll();
      const plans: PokePlanType[] = planModels.map((plan) => ({
        code: plan.code,
        name: plan.name,
        stripeProductId: plan.stripeProductId,
        status: "active",
        limits: {
          assistant: {
            isSlackBotAllowed: plan.isSlackbotAllowed,
            maxMessages: plan.maxMessages,
          },
          connections: {
            isSlackAllowed: plan.isManagedSlackAllowed,
            isNotionAllowed: plan.isManagedNotionAllowed,
            isGoogleDriveAllowed: plan.isManagedGoogleDriveAllowed,
            isGithubAllowed: plan.isManagedGithubAllowed,
          },
          dataSources: {
            count: plan.maxDataSourcesCount,
            documents: {
              count: plan.maxDataSourcesDocumentsCount,
              sizeMb: plan.maxDataSourcesDocumentsSizeMb,
            },
          },
          users: {
            maxUsers: plan.maxUsersInWorkspace,
          },
        },
      }));
      res.status(200).json({
        plans: plans,
      });
      return;

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

export default withLogging(handler);
