import { NextApiRequest, NextApiResponse } from "next";

import { getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Plan } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { PlanType } from "@app/types/user";

type PokePlanType = {
  code: string;
  name: string;
  limits: PlanType["limits"];
};

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
