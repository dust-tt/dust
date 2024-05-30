import type { WithAPIErrorReponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { ScheduledAgentResource } from "@app/lib/resources/scheduled_agent_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchScheduleAgentWorkflow } from "@app/temporal/scheduled_agents/client";

export const ScheduledAssistantPostOrPatchBodySchema = t.intersection([
  t.type({
    name: t.string,
    agentConfigurationId: t.string,
    prompt: t.union([t.string, t.null, t.undefined]),
    timeOfDay: t.string,
    timeZone: t.string,
    // destination fields
    emails: t.union([t.array(t.string), t.null, t.undefined]),
    slackChannelId: t.union([t.string, t.null, t.undefined]),
  }),
  t.union([
    // weekly
    t.type({
      scheduleType: t.literal("weekly"),
      weeklyDaysOfWeek: t.array(t.number),
    }),
    // monthly
    t.type({
      scheduleType: t.literal("monthly"),
      monthlyFirstLast: t.union([t.literal("first"), t.literal("last")]),
      monthlyDayOfWeek: t.number,
    }),
  ]),
]);

export type ListScheduledAgentsResponseBody = {
  scheduledAgents: Array<ReturnType<ScheduledAgentResource["toJSON"]>>;
};

export type PostScheduledAgentResponseBody = {
  scheduledAgent: ReturnType<ScheduledAgentResource["toJSON"]>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      ListScheduledAgentsResponseBody | PostScheduledAgentResponseBody
    >
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();

  if (!owner || !user) {
    res.status(404).end();
    return;
  }

  if (!auth.isBuilder()) {
    res.status(403).end();
    return;
  }

  if (!owner.flags.includes("scheduler")) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const scheduledAgents = await ScheduledAgentResource.listForWorkspace({
        workspace: owner,
      });
      const responseBody = {
        scheduledAgents: scheduledAgents.map((a) => a.toJSON()),
      } satisfies ListScheduledAgentsResponseBody;

      res.status(200).json(responseBody);
      return;

    case "POST":
      const bodyValidation = ScheduledAssistantPostOrPatchBodySchema.decode(
        req.body
      );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        console.error("Validation errors:", pathError);

        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }
      const scheduledAgent = await ScheduledAgentResource.makeNew({
        ...bodyValidation.right,
        userId: user.id,
        workspaceId: owner.id,
      });

      await launchScheduleAgentWorkflow({
        scheduledAgentId: scheduledAgent.sId,
      });

      res.status(201).json({
        scheduledAgent: scheduledAgent.toJSON(),
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
