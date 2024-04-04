import type {
  WithAPIErrorReponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { SolutionsMeetingsTranscriptsConfiguration } from "@app/lib/models/solutions";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetSolutionsConfigurationResponseBody = {
  configuration: SolutionsMeetingsTranscriptsConfiguration | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<GetSolutionsConfigurationResponseBody>>
): Promise<void> {
  let transcriptsConfiguration: SolutionsMeetingsTranscriptsConfiguration | null;
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

  switch (req.method) {
    case "GET":
      transcriptsConfiguration = await SolutionsMeetingsTranscriptsConfiguration.findOne({
        attributes: ["id", "provider"],
        where: {
          userId: owner.id, 
          provider: req.query.provider as string,
        },
      })

      res.status(200).json({ configuration: transcriptsConfiguration });

      return;

    case "POST":
      const { connectionId, provider } = req.body;
      if (!connectionId || !provider) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "missing_parameters",
            message: "The `connectionId` and `provider` parameters are required.",
          },
        });
      }

      transcriptsConfiguration = await SolutionsMeetingsTranscriptsConfiguration.create({
        userId: owner.id,
        connectionId,
        provider,
      });

      res.status(200).json({ configuration: transcriptsConfiguration});

      return;


    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withLogging(handler);
