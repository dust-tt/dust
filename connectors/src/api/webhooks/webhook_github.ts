import { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

import {
  GithubWebhookPayloadSchema,
  isCommentPayload,
  isDiscussionPayload,
  isIssuePayload,
  isPullRequestPayload,
  isRepositoriesAddedPayload,
  isRepositoriesRemovedPayload,
} from "@connectors/connectors/github/lib/github_webhooks";
import {
  launchGithubDiscussionSyncWorkflow,
  launchGithubIssueGarbageCollectWorkflow,
  launchGithubIssueSyncWorkflow,
  launchGithubRepoGarbageCollectWorkflow,
  launchGithubReposSyncWorkflow,
} from "@connectors/connectors/github/temporal/client";
import { assertNever } from "@connectors/lib/assert_never";
import { Connector, GithubConnectorState } from "@connectors/lib/models";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

const HANDLED_WEBHOOKS = {
  installation_repositories: new Set(["added", "removed"]),
  issues: new Set(["opened", "edited", "deleted"]),
  issue_comment: new Set(["created", "edited", "deleted"]),
  pull_request: new Set(["opened", "edited"]),
  discussion: new Set(["created", "edited", "deleted"]),
  discussion_comment: new Set(["created", "edited", "deleted"]),
} as Record<string, Set<string>>;

const logger = mainLogger.child({ provider: "github" });

type GithubWebhookResBody = null | ConnectorsAPIErrorResponse;

const _webhookGithubAPIHandler = async (
  req: Request<
    Record<string, string>,
    GithubWebhookResBody,
    { action?: string }
  >,
  res: Response<GithubWebhookResBody>
) => {
  const event = req.headers["x-github-event"];
  const jsonBody = req.body;
  const action = jsonBody.action || "unknown";

  if (!event || typeof event !== "string") {
    return res.status(400).json({
      error: {
        message: "Missing `x-github-event` header",
      },
    });
  }

  if (!HANDLED_WEBHOOKS[event]?.has(action)) {
    logger.info(
      {
        event,
        action,
      },
      "Ignoring webhook event"
    );
    return res.status(200).end();
  }

  logger.info(
    {
      event,
      action: jsonBody.action,
    },
    "Received webhook"
  );

  const rejectEvent = (pathError?: string): Response<GithubWebhookResBody> => {
    logger.error(
      {
        event,
        action,
        jsonBody,
        pathError,
      },
      "Could not process webhook"
    );
    return res.status(500).end();
  };

  const githubWebookPayloadSchemaValidation =
    GithubWebhookPayloadSchema.decode(jsonBody);
  if (isLeft(githubWebookPayloadSchemaValidation)) {
    const pathError = reporter.formatValidationErrors(
      githubWebookPayloadSchemaValidation.left
    );
    return rejectEvent(pathError.join(", "));
  }

  const payload = githubWebookPayloadSchemaValidation.right;

  const installationId = payload.installation.id.toString();
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

  const githubConnectorState = await GithubConnectorState.findOne({
    where: {
      connectorId: connector?.id,
    },
  });

  if (!githubConnectorState) {
    logger.error(
      {
        connectorId: connector.id,
        installationId,
      },
      "Connector state not found"
    );
    // return 200 to avoid github retrying
    return res.status(200);
  }

  if (
    !githubConnectorState.webhooksEnabledAt ||
    githubConnectorState.webhooksEnabledAt.getTime() > Date.now()
  ) {
    logger.info(
      {
        connectorId: connector.id,
        installationId,
        webhooksEnabledAt: githubConnectorState.webhooksEnabledAt,
      },
      "Ignoring webhook because webhooks are disabled for connector,"
    );

    return res.status(200);
  }

  switch (event) {
    case "installation_repositories":
      if (isRepositoriesAddedPayload(jsonBody)) {
        return syncRepos(
          connector,
          jsonBody.installation.account.login,
          jsonBody.repositories_added.map((r) => ({
            name: r.name,
            id: r.id,
          })),
          res
        );
      } else if (isRepositoriesRemovedPayload(jsonBody)) {
        return garbageCollectRepos(
          connector,
          jsonBody.installation.account.login,
          jsonBody.repositories_removed.map((r) => ({
            name: r.name,
            id: r.id,
          })),
          res
        );
      }
      return rejectEvent();
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

      return rejectEvent();

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
      return rejectEvent();

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
      return rejectEvent();

    case "discussion":
      if (isDiscussionPayload(jsonBody)) {
        if (jsonBody.action === "created" || jsonBody.action === "edited") {
          return syncDiscussion(
            connector,
            jsonBody.organization.login,
            jsonBody.repository.name,
            jsonBody.repository.id,
            jsonBody.discussion.number,
            res
          );
        } else if (jsonBody.action === "deleted") {
          return garbageCollectIssue(
            connector,
            jsonBody.organization.login,
            jsonBody.repository.name,
            jsonBody.repository.id,
            jsonBody.discussion.number,
            res
          );
        } else {
          assertNever(jsonBody.action);
        }
      }
      return rejectEvent();

    case "discussion_comment":
      if (isDiscussionPayload(jsonBody)) {
        if (
          jsonBody.action === "created" ||
          jsonBody.action === "edited" ||
          jsonBody.action === "deleted"
        ) {
          return syncDiscussion(
            connector,
            jsonBody.organization.login,
            jsonBody.repository.name,
            jsonBody.repository.id,
            jsonBody.discussion.number,
            res
          );
        } else {
          assertNever(jsonBody.action);
        }
      }
      return rejectEvent();

    default:
      return rejectEvent();
  }
};

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
  for (const { name, id } of repos) {
    await launchGithubRepoGarbageCollectWorkflow(
      connector.id.toString(),
      orgLogin,
      name,
      id
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

async function syncDiscussion(
  connector: Connector,
  orgLogin: string,
  repoName: string,
  repoId: number,
  discussionNumber: number,
  res: Response<GithubWebhookResBody>
) {
  await launchGithubDiscussionSyncWorkflow(
    connector.id.toString(),
    orgLogin,
    repoName,
    repoId,
    discussionNumber
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
  await launchGithubIssueGarbageCollectWorkflow(
    connector.id.toString(),
    orgLogin,
    repoName,
    repoId,
    issueNumber
  );
  res.status(200).end();
}

export const webhookGithubAPIHandler = withLogging(_webhookGithubAPIHandler);
