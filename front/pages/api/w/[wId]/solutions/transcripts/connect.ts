import type {
  WithAPIErrorReponse,
} from "@dust-tt/types";
import { Nango } from "@nangohq/node";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { SolutionsTranscriptsConfiguration } from "@app/lib/models/solutions";
import { getAuthObject } from "@app/lib/solutions/utils/helpers";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetSolutionsConfigurationResponseBody = {
  configuration: SolutionsTranscriptsConfiguration | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<GetSolutionsConfigurationResponseBody>>
): Promise<void> {
  const { NANGO_SECRET_KEY, NANGO_GOOGLE_DRIVE_CONNECTOR_ID } = process.env;
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
      const transcriptsConfiguration = await SolutionsTranscriptsConfiguration.findOne({
        attributes: ["id", "connectionId", "provider"],
        where: {
          userId: owner.id, 
          provider: req.query.provider as string,
        },
      })

      if (!transcriptsConfiguration) {
        return res.status(200).json({ configuration: null });
      }

      console.log('GOOGLE DRIVE CONNECTOR ID IS: ', NANGO_GOOGLE_DRIVE_CONNECTOR_ID);
      const nango = new Nango({ secretKey: NANGO_SECRET_KEY as string });
      const connectionDetail = await nango.getConnection(
        NANGO_GOOGLE_DRIVE_CONNECTOR_ID as string,
        transcriptsConfiguration.connectionId
      );
      const accessToken = connectionDetail.credentials.raw.access_token;
      console.log('access token is: ', accessToken);

      const auth = getAuthObject(transcriptsConfiguration.connectionId, NANGO_GOOGLE_DRIVE_CONNECTOR_ID as string);

      console.log('auth is: ', auth);
      



      return res.status(200).json({ configuration: transcriptsConfiguration });

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

      const transcriptsConfigurationPost = await SolutionsTranscriptsConfiguration.create({
        userId: owner.id,
        connectionId,
        provider,
      });

      res.status(200).json({ configuration: transcriptsConfigurationPost});

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
