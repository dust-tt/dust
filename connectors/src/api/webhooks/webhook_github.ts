import { Request, Response } from "express";

import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

interface GithubWebhookPayload {
  action: string;
  installation: {
    id: number;
  };
  organization: {
    login: string;
  };
  repository: {
    name: string;
  };
}

function isGithubWebhookPayload(
  payload: unknown
): payload is GithubWebhookPayload {
  return (
    !!(payload as GithubWebhookPayload).action &&
    typeof (payload as GithubWebhookPayload).action === "string" &&
    !!(payload as GithubWebhookPayload).installation &&
    typeof (payload as GithubWebhookPayload).installation.id === "number" &&
    !!(payload as GithubWebhookPayload).organization &&
    typeof (payload as GithubWebhookPayload).organization.login === "string" &&
    !!(payload as GithubWebhookPayload).repository &&
    typeof (payload as GithubWebhookPayload).repository.name === "string"
  );
}

interface RepositoriesAddedPayload {
  action: "added";
  repositories_added: { name: string }[];
}

function isRepositoriesAddedPayload(
  payload: unknown
): payload is RepositoriesAddedPayload {
  return (
    !!(payload as RepositoriesAddedPayload).repositories_added &&
    (payload as RepositoriesAddedPayload).action === "added"
  );
}

interface RepositoriesRemovedPayload {
  action: "removed";
  repositories_removed: { name: string }[];
}

function isRepositoriesRemovedPayload(
  payload: unknown
): payload is RepositoriesRemovedPayload {
  return (
    !!(payload as RepositoriesRemovedPayload).repositories_removed &&
    (payload as RepositoriesRemovedPayload).action === "removed"
  );
}

const issuePayloadActions = ["opened", "edited", "deleted"] as const;

interface IssuePayload {
  action: (typeof issuePayloadActions)[number];
  issue: { id: number; number: number };
}

function isIssuePayload(payload: unknown): payload is IssuePayload {
  return (
    !!(payload as IssuePayload).issue &&
    issuePayloadActions.includes((payload as IssuePayload).action)
  );
}

const commentPayloadActions = ["created", "edited", "deleted"] as const;

interface CommentPayload {
  action: (typeof commentPayloadActions)[number];
  issue: { id: number; number: number };
}

function isCommentPayload(payload: unknown): payload is CommentPayload {
  return (
    !!(payload as CommentPayload).issue &&
    commentPayloadActions.includes((payload as CommentPayload).action)
  );
}

type GithubWebhookReqBody = {
  action: string;
  installation: {
    id: number;
  };
  organization: {
    login: string;
  };
  repository: {
    name: string;
  };
};

type GithubWebhookResBody = null | ConnectorsAPIErrorResponse;

const _webhookGithubAPIHandler = async (
  req: Request<
    Record<string, string>,
    GithubWebhookResBody,
    GithubWebhookReqBody
  >,
  res: Response<GithubWebhookResBody>
) => {
  const event = req.headers["x-github-event"];
  const jsonBody = req.body;

  if (!event || typeof event !== "string") {
    return res.status(400).json({
      error: {
        message: "Missing `x-github-event` header",
      },
    });
  }

  if (!isGithubWebhookPayload(jsonBody)) {
    return res.status(400).json({
      error: {
        message: "Invalid payload",
      },
    });
  }

  switch (event) {
    case "installation_repositories":
      if (isRepositoriesAddedPayload(jsonBody)) {
        // TODO: sync repo
      } else if (isRepositoriesRemovedPayload(jsonBody)) {
        // TODO: garbage collect repo
      } else {
        return res.status(400).json({
          error: {
            message: "Invalid payload",
          },
        });
      }
      break;
    case "issues":
      if (isIssuePayload(jsonBody)) {
        if (jsonBody.action === "opened" || jsonBody.action === "edited") {
          // TODO: sync issue
        } else if (jsonBody.action === "deleted") {
          // TODO: garbage collect issue
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ((_action: never) => ({}))(jsonBody.action);
          res.status(200).end();
        }
      } else {
        // unhandled -- ignore
        return res.status(200).end();
      }
      break;
    case "issue_comment":
      if (isCommentPayload(jsonBody)) {
        if (jsonBody.action === "created" || jsonBody.action === "edited") {
          // TODO: sync issue
        } else if (jsonBody.action === "deleted") {
          // TODO: garbage collect issue
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ((_action: never) => ({}))(jsonBody.action);
          res.status(200).end();
        }
      } else {
        // unhandled -- ignore
        return res.status(200).end();
      }
      break;
    default:
      // unhandled -- ignore
      return res.status(200).end();
  }
};

export const webhookGithubAPIHandler = withLogging(_webhookGithubAPIHandler);
