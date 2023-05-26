import { Request, Response } from "express";

import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type GithubWebhookReqBody = {
  // TODO: fill in
};

type GithubWebhookResBody =
  | {
      // TODO: fill in
    }
  | null
  | ConnectorsAPIErrorResponse;

const _webhookGithubAPIHandler = async (
  req: Request<
    Record<string, string>,
    GithubWebhookResBody,
    GithubWebhookReqBody
  >,
  res: Response<GithubWebhookResBody>
) => {
  const jsonBody = req.body;
  console.log("HOOK BODY", jsonBody);
  return res.status(200).end();
};

export const webhookGithubAPIHandler = withLogging(_webhookGithubAPIHandler);
