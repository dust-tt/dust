import type { ModelId, WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { Request, Response } from "express";
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
  launchGithubCodeSyncWorkflow,
  launchGithubDiscussionGarbageCollectWorkflow,
  launchGithubDiscussionSyncWorkflow,
  launchGithubIssueGarbageCollectWorkflow,
  launchGithubIssueSyncWorkflow,
  launchGithubRepoGarbageCollectWorkflow,
  launchGithubReposSyncWorkflow,
} from "@connectors/connectors/github/temporal/client";
import {
  GithubCodeRepository,
  GithubConnectorState,
} from "@connectors/lib/models/github";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const HANDLED_WEBHOOKS = {
  installation_repositories: new Set(["added", "removed"]),
  issues: new Set(["opened", "edited", "deleted"]),
  issue_comment: new Set(["created", "edited", "deleted"]),
  pull_request: new Set(["opened", "edited", "closed"]),
  discussion: new Set(["created", "edited", "deleted"]),
  discussion_comment: new Set(["created", "edited", "deleted"]),
} as Record<string, Set<string>>;

const logger = mainLogger.child({ provider: "github" });

type GithubWebhookResBody = WithConnectorsAPIErrorReponse<null>;

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
        type: "invalid_request_error",
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

  const githubConnectorStates = await GithubConnectorState.findAll({
    where: {
      installationId,
    },
  });

  const connectors = (
    await ConnectorResource.fetchByIds(
      "github",
      githubConnectorStates.map((s) => s.connectorId)
    )
  ).reduce(
    (acc, curr) => Object.assign(acc, { [curr.id]: curr }),
    {} as Record<ModelId, ConnectorResource>
  );

  const enabledConnectors: ConnectorResource[] = [];

  for (const connectorState of githubConnectorStates) {
    const connector = connectors[connectorState.connectorId];

    if (!connector) {
      logger.error(
        {
          connectorId: connectorState.connectorId,
          installationId,
        },
        "Connector unexpectedly not found"
      );
      continue;
    }

    if (connector.isPaused()) {
      logger.info(
        {
          connectorId: connector.id,
          installationId,
        },
        "Skipping webhook for Github connector because it is paused."
      );
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
        } else if (jsonBody.action === "closed") {
          if (jsonBody.pull_request.merged) {
            return syncCode(
              enabledConnectors,
              jsonBody.organization.login,
              jsonBody.repository.name,
              jsonBody.repository.id,
              res
            );
          } else {
            return res.status(200).end();
          }
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
  connectors: ConnectorResource[],
  orgLogin: string,
  repos: { name: string; id: number }[],
  res: Response<GithubWebhookResBody>
) {
  let hasErrors = false;
  await Promise.all(
    connectors.map((c) =>
      launchGithubReposSyncWorkflow(c.id, orgLogin, repos).catch((err) => {
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
      })
    )
  );
  if (hasErrors) {
    res.status(500).end();
  } else {
    res.status(200).end();
  }
}

async function garbageCollectRepos(
  connectors: ConnectorResource[],
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

async function syncCode(
  connectors: ConnectorResource[],
  orgLogin: string,
  repoName: string,
  repoId: number,
  res: Response<GithubWebhookResBody>
) {
  let hasErrors = false;

  await Promise.all(
    connectors.map(async (c) => {
      const githubCodeRepository = await GithubCodeRepository.findOne({
        where: {
          connectorId: c.id,
          repoId: repoId.toString(),
        },
      });

      if (!githubCodeRepository) {
        // We don't have a GithubCodeRepository object for this repo which means it's not synced so
        // we can just return.
        logger.info(
          {
            connectorId: c.id,
            orgLogin,
            repoName,
            repoId,
          },
          "githubCodeSync: skipping, GithubCodeRepository not found"
        );
        return;
      }

      const SYNCING_INTERVAL = 1000 * 60 * 60 * 8; // 8h
      if (
        githubCodeRepository.lastSeenAt.getTime() >
        Date.now() - SYNCING_INTERVAL
      ) {
        // We've synced this repo in the last SYNCING_INTERVAL so we can just return.
        logger.info(
          {
            connectorId: c.id,
            orgLogin,
            repoName,
            repoId,
            lastSeenAt: githubCodeRepository.lastSeenAt,
          },
          "githubCodeSync: skipping, GithubCodeRepository still fresh"
        );
        return;
      }

      try {
        logger.info(
          {
            connectorId: c.id,
            orgLogin,
            repoName,
            repoId,
            lastSeenAt: githubCodeRepository.lastSeenAt,
          },
          "githubCodeSync: Starting workflow"
        );
        // We signal the workflow to start the sync of the repo.
        await launchGithubCodeSyncWorkflow(c.id, orgLogin, repoName, repoId);

        // And finally update the lastSeenAt. Multiple PR merge can race through that logic but
        // since we debounce the code sync workflow 10s this will result in only one actual workflow
        // running safely.
        await githubCodeRepository.update({
          lastSeenAt: new Date(),
        });
      } catch (err) {
        logger.error(
          {
            err,
            connectorId: c.id,
            orgLogin,
            repoName,
            repoId,
          },
          "githubCodeSync: Failed to launch workflow"
        );
        hasErrors = true;
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
  connectors: ConnectorResource[],
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
  connectors: ConnectorResource[],
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
  connectors: ConnectorResource[],
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
  connectors: ConnectorResource[],
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
