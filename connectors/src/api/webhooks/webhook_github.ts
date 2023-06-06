import { Request, Response } from "express";

import {
  launchGithubIssueSyncWorkflow,
  launchGithubReposSyncWorkflow,
} from "@connectors/connectors/github/temporal/client";
import { assertNever } from "@connectors/lib/assert_never";
import { Connector } from "@connectors/lib/models";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

const logger = mainLogger.child({ provider: "github" });

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
    id: number;
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
  repositories_added: { name: string; id: number }[];
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
  repositories_removed: { name: string; id: number }[];
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

const pullRequestPayloadActions = ["opened", "edited"] as const;

interface PullRequestPayload {
  action: (typeof pullRequestPayloadActions)[number];
  pull_request: { id: number; number: number };
}

function isPullRequestPayload(payload: unknown): payload is PullRequestPayload {
  return (
    !!(payload as PullRequestPayload).pull_request &&
    pullRequestPayloadActions.includes((payload as PullRequestPayload).action)
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

  const _ignoreEvent = () => {
    return ignoreEvent(
      {
        event,
        action: jsonBody.action,
      },
      res
    );
  };

  if (!isGithubWebhookPayload(jsonBody)) {
    return res.status(400).json({
      error: {
        message: "Invalid payload",
      },
    });
  }

  logger.info(
    {
      event,
      action: jsonBody.action,
    },
    "Received webhook"
  );

  const installationId = jsonBody.installation.id;
  const connector = await Connector.findOne({
    where: {
      connectionId: installationId,
    },
  });

  if (!connector) {
    logger.error(
      {
        installationId,
      },
      "Connector not found"
    );
    // return 200 to avoid github retrying
    return res.status(200);
  }

  // TODO: check connector state (paused, etc.)
  // if connector is paused, return 200 to avoid github retrying

  switch (event) {
    case "installation_repositories":
      if (isRepositoriesAddedPayload(jsonBody)) {
        return syncRepos(
          connector,
          jsonBody.organization.login,
          jsonBody.repositories_added.map((r) => ({ name: r.name, id: r.id })),
          res
        );
      } else if (isRepositoriesRemovedPayload(jsonBody)) {
        return garbageCollectRepos(
          connector,
          jsonBody.organization.login,
          jsonBody.repositories_removed.map((r) => ({
            name: r.name,
            id: r.id,
          })),
          res
        );
      }
      return res.status(400).json({
        error: {
          message: "Invalid payload",
        },
      });
    case "issues":
      if (isIssuePayload(jsonBody)) {
        if (jsonBody.action === "opened" || jsonBody.action === "edited") {
          return syncIssue(
            connector,
            jsonBody.organization.login,
            jsonBody.repository.name,
            jsonBody.repository.id,
            jsonBody.issue.number,
            res
          );
        } else if (jsonBody.action === "deleted") {
          return garbageCollectIssue(
            connector,
            jsonBody.organization.login,
            jsonBody.repository.name,
            jsonBody.repository.id,
            jsonBody.issue.number,
            res
          );
        } else {
          assertNever(jsonBody.action);
        }
      }
      return _ignoreEvent();

    case "issue_comment":
      if (isCommentPayload(jsonBody)) {
        if (
          jsonBody.action === "created" ||
          jsonBody.action === "edited" ||
          jsonBody.action === "deleted"
        ) {
          return syncIssue(
            connector,
            jsonBody.organization.login,
            jsonBody.repository.name,
            jsonBody.repository.id,
            jsonBody.issue.number,
            res
          );
        } else {
          assertNever(jsonBody.action);
        }
      }
      return _ignoreEvent();

    case "pull_request":
      if (isPullRequestPayload(jsonBody)) {
        if (jsonBody.action === "opened" || jsonBody.action === "edited") {
          return syncIssue(
            connector,
            jsonBody.organization.login,
            jsonBody.repository.name,
            jsonBody.repository.id,
            jsonBody.pull_request.number,
            res
          );
        } else {
          assertNever(jsonBody.action);
        }
      }
      return _ignoreEvent();

    default:
      return _ignoreEvent();
  }
};

function ignoreEvent(
  {
    event,
    action,
  }: {
    event: string;
    action: string;
  },
  res: Response<GithubWebhookResBody>
) {
  logger.info(
    {
      event,
      action,
    },
    "Ignoring event"
  );
  res.status(200).end();
}

async function syncRepos(
  connector: Connector,
  orgLogin: string,
  repos: { name: string; id: number }[],
  res: Response<GithubWebhookResBody>
) {
  await launchGithubReposSyncWorkflow(connector.id.toString(), orgLogin, repos);
  res.status(200).end();
}

async function garbageCollectRepos(
  connector: Connector,
  orgLogin: string,
  repos: { name: string; id: number }[],
  res: Response<GithubWebhookResBody>
) {
  for (const repo of repos) {
    console.log(
      "GARBAGE COLLECT REPO",
      connector.connectionId,
      orgLogin,
      repo.name,
      repo.id
    );
  }
  res.status(200).end();
}

async function syncIssue(
  connector: Connector,
  orgLogin: string,
  repoName: string,
  repoId: number,
  issueNumber: number,
  res: Response<GithubWebhookResBody>
) {
  await launchGithubIssueSyncWorkflow(
    connector.id.toString(),
    orgLogin,
    repoName,
    repoId,
    issueNumber
  );
  res.status(200).end();
}

async function garbageCollectIssue(
  connector: Connector,
  orgLogin: string,
  repoName: string,
  repoId: number,
  issueNumber: number,
  res: Response<GithubWebhookResBody>
) {
  console.log(
    "GARBAGE COLLECT ISSUE",
    connector.connectionId,
    orgLogin,
    repoName,
    repoId,
    issueNumber
  );
  res.status(200).end();
}

export const webhookGithubAPIHandler = withLogging(_webhookGithubAPIHandler);
