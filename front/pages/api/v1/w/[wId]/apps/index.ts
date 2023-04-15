import { getApps } from "@app/lib/api/app";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { APIError } from "@app/lib/error";
import { withLogging } from "@app/logger/withlogging";
import { AppType } from "@app/types/app";
import { NextApiRequest, NextApiResponse } from "next";

export type GetAppsResponseBody = {
  apps: AppType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetAppsResponseBody | APIError>
): Promise<void> {
  let keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    const err = keyRes.error;
    return res.status(err.status_code).json(err.api_error);
  }
  let auth = await Authenticator.fromKey(keyRes.value, req.query.wId as string);

  let apps = await getApps(auth);

  switch (req.method) {
    case "GET":
      res.status(200).json({ apps });
      return;

    default:
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
      return;
  }
}

export default withLogging(handler);
