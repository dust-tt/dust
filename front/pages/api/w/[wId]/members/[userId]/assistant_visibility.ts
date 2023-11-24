import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator, getSession } from "@app/lib/auth";
import { Membership, User } from "@app/lib/models";
import { MemberAgentVisibility } from "@app/lib/models/assistant/agent";
import { apiError, withLogging } from "@app/logger/withlogging";
import { MemberAgentVisibilityType } from "@app/types/assistant/agent";

export type PostMemberAssistantVisibilityResponseBody = {
  created: boolean | null;
  visibility: MemberAgentVisibilityType;
};

export const PostMemberAssistantVisibilityRequestBodySchema = t.type({
  assistantSid: t.string,
  visibility: t.union([
    t.literal("workspace-unlisted"),
    t.literal("published-listed"),
  ]),
});

export const DeleteMemberAssistantsVisibilityBodySchema = t.type({
  assistantSid: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    PostMemberAssistantVisibilityResponseBody | { success: boolean }
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const userId = parseInt(req.query.userId as string);
  if (isNaN(userId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "The user requested was not found.",
      },
    });
  }

  const [user, membership] = await Promise.all([
    User.findOne({
      where: {
        id: userId,
      },
    }),
    Membership.findOne({
      where: {
        userId: userId,
        workspaceId: owner.id,
      },
    }),
  ]);

  if (!user || !membership) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "The user requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation =
        PostMemberAssistantVisibilityRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { assistantSid, visibility } = bodyValidation.right;
      // get the agent configuration
      const agentConfiguration = await getAgentConfiguration(
        auth,
        assistantSid
      );
      if (!agentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent configuration was not found.",
          },
        });
      }
      // create or update the MemberAgentList entry
      const [memberAgentVisibility, created] =
        await MemberAgentVisibility.upsert({
          membershipId: membership.id,
          agentConfigurationId: agentConfiguration.id,
          visibility: visibility,
        });
      res
        .status(200)
        .json({ created, visibility: memberAgentVisibility.visibility });
      return;
    case "DELETE":
      const bodyValidationDelete =
        DeleteMemberAssistantsVisibilityBodySchema.decode(req.body);
      if (isLeft(bodyValidationDelete)) {
        const pathError = reporter.formatValidationErrors(
          bodyValidationDelete.left
        );

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      const { assistantSid: assistantSidToDelete } = bodyValidationDelete.right;
      // get the agent configuration
      const deletionAgentConfiguration = await getAgentConfiguration(
        auth,
        assistantSidToDelete
      );
      if (!deletionAgentConfiguration) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: "The agent configuration was not found.",
          },
        });
      }
      if (deletionAgentConfiguration.scope === "private") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Cannot remove visibility entry for a 'private'-scope assistant. Please delete the assistant instead.",
          },
        });
      }
      // delete the MemberAgentList entry
      await MemberAgentVisibility.destroy({
        where: {
          membershipId: membership.id,
          agentConfigurationId: deletionAgentConfiguration.id,
        },
      });
      res.status(200).json({ success: true });
      return;
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
