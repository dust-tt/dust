import { NextApiRequest, NextApiResponse } from "next";

import { getGensTemplates } from "@app/lib/api/gens";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
import { GensTemplateType } from "@app/types/gens";

export type GetTemplatesResponseBody = {
  templates: GensTemplateType[];
};

export type PostTemplatesResponseBody = {
  template: GensTemplateType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetTemplatesResponseBody | PostTemplatesResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = await getUserFromSession(session);
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const temp_data = await getGensTemplates(owner, user);
      res.status(200).json({
        templates: temp_data,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "invalid_request_error",
          message: "This endpoint only supports GET",
        },
      });
  }
}

export default withLogging(handler);
