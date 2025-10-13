import { assertNever } from "@dust-tt/client";
import { Op } from "sequelize";

import { getOctokit } from "@connectors/connectors/github/lib/github_api";
import {
  launchGithubCodeSyncDailyCronWorkflow,
  launchGithubCodeSyncWorkflow,
  launchGithubFullSyncWorkflow,
  launchGithubIssueSyncWorkflow,
  launchGithubRepoSyncWorkflow,
} from "@connectors/connectors/github/temporal/client";
import {
  getCodeSyncWorkflowId,
  getRepoSyncWorkflowId,
} from "@connectors/connectors/github/temporal/utils";
import {
  GithubCodeFile,
  GithubCodeRepository,
  GithubConnectorState,
  GithubIssue,
} from "@connectors/lib/models/github";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  AdminSuccessResponseType,
  GithubCommandType,
} from "@connectors/types";

async function getGitHubConnector(args: GithubCommandType["args"]) {
  if (args.connectorId) {
    const connector = await ConnectorResource.fetchById(args.connectorId);
    if (!connector) {
      throw new Error(`Connector ${args.connectorId} not found.`);
    }
    if (connector.type !== "github") {
      throw new Error(`Connector ${args.connectorId} is not of type github`);
    }
    return connector;
  }

  if (!args.wId) {
    throw new Error("Missing --wId argument");
  }
  if (!args.dsId) {
    throw new Error("Missing --dsId argument");
  }

  const connector = await ConnectorResource.findByDataSource({
    workspaceId: `${args.wId}`,
    dataSourceId: args.dsId,
  });
  if (!connector) {
    throw new Error(
      `Could not find connector for workspace ${args.wId}, data source ${args.dsId}`
    );
  }

  return connector;
}

export const github = async ({
  command,
  args,
}: GithubCommandType): Promise<AdminSuccessResponseType> => {
  const logger = topLogger.child({ majorCommand: "github", command, args });

  const connector = await getGitHubConnector(args);

  switch (command) {
    case "resync-repo": {
      if (!args.owner) {
        throw new Error("Missing --owner argument");
      }
      if (!args.repo) {
        throw new Error("Missing --repo argument");
      }

      logger.info("[Admin] Resyncing repo " + args.owner + "/" + args.repo);

      const octokit = await getOctokit(connector);

      const { data } = await octokit.rest.repos.get({
        owner: args.owner,
        repo: args.repo,
      });

      const repoId = data.id;
      logger.info(
        `[Admin] Successfully retrieved repo ${args.owner}/${args.repo} (ID: ${repoId})`
      );

      const workflowId = getRepoSyncWorkflowId(connector.id, repoId);
      const temporalNamespace = process.env.TEMPORAL_NAMESPACE;
      if (temporalNamespace) {
        const workflowUrl = `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${workflowId}`;
        logger.info(`[Admin] Started temporal workflow - ${workflowUrl}`);
      } else {
        logger.info(`[Admin] Started temporal workflow with id: ${workflowId}`);
      }

      await launchGithubRepoSyncWorkflow(
        connector.id,
        args.owner,
        args.repo,
        repoId
      );

      return { success: true };
    }

    case "resync-repo-code": {
      if (!args.owner) {
        throw new Error("Missing --owner argument");
      }
      if (!args.repo) {
        throw new Error("Missing --repo argument");
      }

      logger.info(
        "[Admin] Resyncing repo code " + args.owner + "/" + args.repo
      );

      const octokit = await getOctokit(connector);

      const { data } = await octokit.rest.repos.get({
        owner: args.owner,
        repo: args.repo,
      });

      const repoId = data.id;
      logger.info(
        `[Admin] Successfully retrieved repo ${args.owner}/${args.repo} (ID: ${repoId})`
      );

      const workflowId = getCodeSyncWorkflowId(connector.id, repoId);
      const temporalNamespace = process.env.TEMPORAL_NAMESPACE;
      if (temporalNamespace) {
        const workflowUrl = `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${workflowId}`;
        logger.info(`[Admin] Started temporal workflow - ${workflowUrl}`);
      } else {
        logger.info(`[Admin] Started temporal workflow with id: ${workflowId}`);
      }

      await launchGithubCodeSyncWorkflow(
        connector.id,
        args.owner,
        args.repo,
        repoId
      );

      return { success: true };
    }

    case "code-sync": {
      if (!args.enable) {
        throw new Error("Missing --enable (true/false) argument");
      }
      if (!["true", "false"].includes(args.enable)) {
        throw new Error("--enable must be true or false");
      }

      const enable = args.enable === "true";

      const connectorState = await GithubConnectorState.findOne({
        where: {
          connectorId: connector.id,
        },
      });
      if (!connectorState) {
        throw new Error(
          `Connector state not found for connector ${connector.id}`
        );
      }

      await connectorState.update({
        codeSyncEnabled: enable,
      });

      // full-resync, code sync only.
      await launchGithubFullSyncWorkflow({
        connectorId: connector.id,
        syncCodeOnly: true,
      });

      return { success: true };
    }

    case "sync-issue": {
      if (!args.repoLogin) {
        throw new Error("Missing --repoLogin argument");
      }
      if (!args.repoName) {
        throw new Error("Missing --repoName argument");
      }
      if (!args.repoId) {
        throw new Error("Missing --repoId argument");
      }
      if (!args.issueNumber) {
        throw new Error("Missing --issueNumber argument");
      }

      await launchGithubIssueSyncWorkflow(
        connector.id,
        `${args.repoLogin}`,
        `${args.repoName}`,
        parseInt(`${args.repoId}`),
        parseInt(`${args.issueNumber}`)
      );

      return { success: true };
    }

    case "skip-issue": {
      if (!args.repoId) {
        throw new Error("Missing --repoId argument");
      }
      if (!args.issueNumber) {
        throw new Error("Missing --issueNumber argument");
      }
      if (!args.skipReason) {
        throw new Error("Missing --skipReason argument");
      }

      await GithubIssue.upsert({
        repoId: args.repoId.toString(),
        issueNumber: parseInt(args.issueNumber, 10),
        connectorId: connector.id,
        skipReason: args.skipReason,
      });

      return { success: true };
    }

    case "force-daily-code-sync": {
      if (!args.repoId) {
        throw new Error("Missing --repoId argument");
      }

      const githubCodeRepository = await GithubCodeRepository.findOne({
        where: {
          connectorId: connector.id,
          repoId: args.repoId,
        },
      });
      if (!githubCodeRepository) {
        throw new Error(
          `Could not find github code repository for connector ${connector.id}, repoId ${args.repoId}`
        );
      }

      await githubCodeRepository.update({
        forceDailySync: true,
      });

      await launchGithubCodeSyncDailyCronWorkflow(
        connector.id,
        githubCodeRepository.repoLogin,
        githubCodeRepository.repoName,
        parseInt(githubCodeRepository.repoId)
      );

      return { success: true };
    }

    case "skip-repo": {
      if (!args.repoId) {
        throw new Error("Missing --repoId argument");
      }
      if (!args.skipReason) {
        throw new Error("Missing --skipReason argument");
      }

      const githubCodeRepository = await GithubCodeRepository.findOne({
        where: {
          connectorId: connector.id,
          repoId: args.repoId,
        },
      });
      if (!githubCodeRepository) {
        throw new Error(
          `Could not find github code repository for connector ${connector.id}, repoId ${args.repoId}`
        );
      }

      await githubCodeRepository.update({
        skipReason: args.skipReason,
      });

      logger.info(
        `[Admin] Skipped repository ${args.repoId} with reason: ${args.skipReason}`
      );

      return { success: true };
    }

    case "unskip-repo": {
      if (!args.repoId) {
        throw new Error("Missing --repoId argument");
      }

      const githubCodeRepository = await GithubCodeRepository.findOne({
        where: {
          connectorId: connector.id,
          repoId: args.repoId,
        },
      });
      if (!githubCodeRepository) {
        throw new Error(
          `Could not find github code repository for connector ${connector.id}, repoId ${args.repoId}`
        );
      }

      await githubCodeRepository.update({
        skipReason: null,
      });

      logger.info(`[Admin] Unskipped repository ${args.repoId}`);

      return { success: true };
    }

    case "list-skipped-repos": {
      const skippedRepos = await GithubCodeRepository.findAll({
        where: {
          connectorId: connector.id,
          skipReason: {
            [Op.ne]: null,
          },
        },
      });

      logger.info(`[Admin] Found ${skippedRepos.length} skipped repositories:`);
      for (const repo of skippedRepos) {
        logger.info(
          `  - Repository ${repo.repoLogin}/${repo.repoName} (ID: ${repo.repoId}): ${repo.skipReason}`
        );
      }

      return { success: true };
    }

    case "skip-code-file": {
      if (!args.repoId) {
        throw new Error("Missing --repoId argument");
      }
      if (!args.documentId) {
        throw new Error("Missing --documentId argument");
      }
      if (!args.skipReason) {
        throw new Error("Missing --skipReason argument");
      }

      const githubCodeRepository = await GithubCodeRepository.findOne({
        where: {
          connectorId: connector.id,
          repoId: args.repoId,
        },
      });
      if (!githubCodeRepository) {
        throw new Error(
          `Could not find github code repository for connector ${connector.id}, repoId ${args.repoId}`
        );
      }

      const githubCodeFile = await GithubCodeFile.findOne({
        where: {
          connectorId: connector.id,
          repoId: args.repoId,
          documentId: args.documentId,
        },
      });

      if (!githubCodeFile) {
        throw new Error(
          `Could not find github code file for connector ${connector.id}, repoId ${args.repoId}, documentId ${args.documentId}`
        );
      }

      await githubCodeFile.update({
        skipReason: args.skipReason,
      });

      logger.info(
        `[Admin] Skipped code file ${args.repoId}/${args.documentId} with reason: ${args.skipReason}`
      );

      return { success: true };
    }

    case "unskip-code-file": {
      if (!args.repoId) {
        throw new Error("Missing --repoId argument");
      }
      if (!args.documentId) {
        throw new Error("Missing --documentId argument");
      }

      const githubCodeRepository = await GithubCodeRepository.findOne({
        where: {
          connectorId: connector.id,
          repoId: args.repoId,
        },
      });
      if (!githubCodeRepository) {
        throw new Error(
          `Could not find github code repository for connector ${connector.id}, repoId ${args.repoId}`
        );
      }

      const githubCodeFile = await GithubCodeFile.findOne({
        where: {
          connectorId: connector.id,
          repoId: args.repoId,
          documentId: args.documentId,
        },
      });
      if (!githubCodeFile) {
        throw new Error(
          `Could not find github code file for connector ${connector.id}, repoId ${args.repoId}, documentId ${args.documentId}`
        );
      }

      await githubCodeFile.update({
        skipReason: null,
      });

      logger.info(
        `[Admin] Unskipped code file ${args.repoId}/${args.documentId}`
      );

      return { success: true };
    }

    case "clear-installation-id": {
      const connectorState = await GithubConnectorState.findOne({
        where: {
          connectorId: connector.id,
        },
      });
      if (!connectorState) {
        throw new Error(
          `Could not find github connector state for workspace ${args.wId}, data source ${args.dsId}`
        );
      }

      await connectorState.update({
        installationId: null,
      });

      return { success: true };
    }

    default:
      assertNever(command);
  }
};
