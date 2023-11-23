import { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { Op } from "sequelize";

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
  launchGithubDiscussionGarbageCollectWorkflow,
  launchGithubDiscussionSyncWorkflow,
  launchGithubIssueGarbageCollectWorkflow,
  launchGithubIssueSyncWorkflow,
  launchGithubRepoGarbageCollectWorkflow,
  launchGithubReposSyncWorkflow,
} from "@connectors/connectors/github/temporal/client";
import { assertNever } from "@connectors/lib/assert_never";
import { Connector } from "@connectors/lib/models";
import { GithubConnectorState } from "@connectors/lib/models/github";
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

  const connectors = await Connector.findAll({
    where: {
      connectionId: installationId,
      type: "github",
    },
  });

  if (!connectors.length) {
    logger.error(
      {
        installationId,
      },
      "No GitHub connectors found for installation"
    );
    // return 200 to avoid github retrying
    return res.status(200);
  }

  const githubConnectorStates = (
    await GithubConnectorState.findAll({
      where: {
        connectorId: {
          [Op.in]: connectors.map((c) => c.id),
        },
      },
    })
  ).reduce(
    (acc, curr) => Object.assign(acc, { [curr.connectorId]: curr }),
    {} as Record<string, GithubConnectorState>
  );

  const enabledConnectors: Connector[] = [];
  for (const connector of connectors) {
    const connectorState = githubConnectorStates[connector.id];
    if (!connectorState) {
      logger.error(
        {
          connectorId: connector.id,
          installationId,
        },
        "Connector state not found"
      );
      // return 200 to avoid github retrying
      continue;
    }
    if (
      !connectorState.webhooksEnabledAt ||
      connectorState.webhooksEnabledAt.getTime() > Date.now()
    ) {
      logger.info(
        {
          connectorId: connectorState.connectorId,
          installationId,
          webhooksEnabledAt: connectorState.webhooksEnabledAt,
        },
        "Ignoring webhook because webhooks are disabled for connector,"
      );
    } else {
      enabledConnectors.push(connector);
    }
  }

  switch (event) {
    case "installation_repositories":
      if (isRepositoriesAddedPayload(jsonBody)) {
        return syncRepos(
          enabledConnectors,
          jsonBody.installation.account.login,
          jsonBody.repositories_added.map((r) => ({
            name: r.name,
            id: r.id,
          })),
          res
        );
      } else if (isRepositoriesRemovedPayload(jsonBody)) {
        return garbageCollectRepos(
          enabledConnectors,
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
            enabledConnectors,
            jsonBody.organization.login,
            jsonBody.repository.name,
            jsonBody.repository.id,
            jsonBody.issue.number,
            res
          );
        } else if (jsonBody.action === "deleted") {
          return garbageCollectIssue(
            enabledConnectors,
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
            enabledConnectors,
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
            enabledConnectors,
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
            enabledConnectors,
            jsonBody.organization.login,
            jsonBody.repository.name,
            jsonBody.repository.id,
            jsonBody.discussion.number,
            res
          );
        } else if (jsonBody.action === "deleted") {
          return garbageCollectDiscussion(
            enabledConnectors,
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
            enabledConnectors,
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
  connectors: Connector[],
  orgLogin: string,
  repos: { name: string; id: number }[],
  res: Response<GithubWebhookResBody>
) {
  let hasErrors = false;
  await Promise.all(
    connectors.map((c) =>
      launchGithubReposSyncWorkflow(c.id.toString(), orgLogin, repos).catch(
        (err) => {
          logger.error(
            {
              err,
              connectorId: c.id,
              orgLogin,
              repos,
            },
            "Failed to launch github repos sync workflow"
          );
          hasErrors = true;
        }
      )
    )
  );
  if (hasErrors) {
    res.status(500).end();
  } else {
    res.status(200).end();
  }
}

async function garbageCollectRepos(
  connectors: Connector[],
  orgLogin: string,
  repos: { name: string; id: number }[],
  res: Response<GithubWebhookResBody>
) {
  let hasErrors = false;

  await Promise.all(
    connectors.map(async (c) => {
      for (const { name, id } of repos) {
        try {
          await launchGithubRepoGarbageCollectWorkflow(
            c.id.toString(),
            orgLogin,
            name,
            id
          );
        } catch (err) {
          logger.error(
            {
              err,
              connectorId: c.id,
              orgLogin,
              repos,
            },
            "Failed to launch github repo garbage collect workflow"
          );
          hasErrors = true;
        }
      }
    })
  );

  if (hasErrors) {
    res.status(500).end();
  } else {
    res.status(200).end();
  }
}

async function syncIssue(
  connectors: Connector[],
  orgLogin: string,
  repoName: string,
  repoId: number,
  issueNumber: number,
  res: Response<GithubWebhookResBody>
) {
  let hasErrors = false;

  await Promise.all(
    connectors.map((c) =>
      launchGithubIssueSyncWorkflow(
        c.id.toString(),
        orgLogin,
        repoName,
        repoId,
        issueNumber
      ).catch((err) => {
        logger.error(
          {
            err,
            connectorId: c.id,
            orgLogin,
            repoName,
            repoId,
            issueNumber,
          },
          "Failed to launch github issue sync workflow"
        );
        hasErrors = true;
      })
    )
  );

  if (hasErrors) {
    res.status(500).end();
  } else {
    res.status(200).end();
  }
}

async function syncDiscussion(
  connectors: Connector[],
  orgLogin: string,
  repoName: string,
  repoId: number,
  discussionNumber: number,
  res: Response<GithubWebhookResBody>
) {
  let hasErrors = false;

  await Promise.all(
    connectors.map((c) =>
      launchGithubDiscussionSyncWorkflow(
        c.id.toString(),
        orgLogin,
        repoName,
        repoId,
        discussionNumber
      ).catch((err) => {
        logger.error(
          {
            err,
            connectorId: c.id,
            orgLogin,
            repoName,
            repoId,
            discussionNumber,
          },
          "Failed to launch github discussion sync workflow"
        );
        hasErrors = true;
      })
    )
  );

  if (hasErrors) {
    res.status(500).end();
  } else {
    res.status(200).end();
  }
}

async function garbageCollectIssue(
  connectors: Connector[],
  orgLogin: string,
  repoName: string,
  repoId: number,
  issueNumber: number,
  res: Response<GithubWebhookResBody>
) {
  let hasErrors = false;

  await Promise.all(
    connectors.map((c) =>
      launchGithubIssueGarbageCollectWorkflow(
        c.id.toString(),
        orgLogin,
        repoName,
        repoId,
        issueNumber
      ).catch((err) => {
        logger.error(
          {
            err,
            connectorId: c.id,
            orgLogin,
            repoName,
            repoId,
            issueNumber,
          },
          "Failed to launch github issue garbage collect workflow"
        );
        hasErrors = true;
      })
    )
  );

  if (hasErrors) {
    res.status(500).end();
  } else {
    res.status(200).end();
  }
}

async function garbageCollectDiscussion(
  connectors: Connector[],
  orgLogin: string,
  repoName: string,
  repoId: number,
  discussionNumber: number,
  res: Response<GithubWebhookResBody>
) {
  let hasErrors = false;

  await Promise.all(
    connectors.map((c) =>
      launchGithubDiscussionGarbageCollectWorkflow(
        c.id.toString(),
        orgLogin,
        repoName,
        repoId,
        discussionNumber
      ).catch((err) => {
        logger.error(
          {
            err,
            connectorId: c.id,
            orgLogin,
            repoName,
            repoId,
            discussionNumber,
          },
          "Failed to launch github discussion garbage collect workflow"
        );
        hasErrors = true;
      })
    )
  );

  if (hasErrors) {
    res.status(500).end();
  } else {
    res.status(200).end();
  }
}

export const webhookGithubAPIHandler = withLogging(_webhookGithubAPIHandler);
