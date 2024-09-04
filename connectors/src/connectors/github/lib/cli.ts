import type {
  AdminSuccessResponseType,
  GithubCommandType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import { getOctokit } from "@connectors/connectors/github/lib/github_api";
import {
  launchGithubCodeSyncDailyCronWorkflow,
  launchGithubCodeSyncWorkflow,
  launchGithubFullSyncWorkflow,
  launchGithubIssueSyncWorkflow,
} from "@connectors/connectors/github/temporal/client";
import {
  GithubCodeRepository,
  GithubConnectorState,
} from "@connectors/lib/models/github";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export const github = async ({
  command,
  args,
}: GithubCommandType): Promise<AdminSuccessResponseType> => {
  const logger = topLogger.child({ majorCommand: "github", command, args });
  switch (command) {
    case "resync-repo": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }
      if (!args.owner) {
        throw new Error("Missing --owner argument");
      }
      if (!args.repo) {
        throw new Error("Missing --repo argument");
      }

      const connector = await ConnectorResource.findByDataSource({
        workspaceId: `${args.wId}`,
        dataSourceId: args.dsId,
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName}`
        );
      }

      logger.info("[Admin] Resyncing repo " + args.owner + "/" + args.repo);

      const octokit = await getOctokit(connector.connectionId);

      const { data } = await octokit.rest.repos.get({
        owner: args.owner,
        repo: args.repo,
      });

      const repoId = data.id;

      await launchGithubCodeSyncWorkflow(
        connector.id,
        args.owner,
        args.repo,
        repoId
      );

      return { success: true };
    }

    case "code-sync": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }
      if (!args.enable) {
        throw new Error("Missing --enable (true/false) argument");
      }
      if (!["true", "false"].includes(args.enable)) {
        throw new Error("--enable must be true or false");
      }

      const enable = args.enable === "true";

      const connector = await ConnectorResource.findByDataSource({
        workspaceId: `${args.wId}`,
        dataSourceId: args.dsId,
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName}`
        );
      }

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
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }
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

      const connector = await ConnectorResource.findByDataSource({
        workspaceId: `${args.wId}`,
        dataSourceId: args.dsId,
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName}`
        );
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
    case "force-daily-code-sync": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }
      if (!args.repoId) {
        throw new Error("Missing --repoId argument");
      }

      const connector = await ConnectorResource.findByDataSource({
        workspaceId: `${args.wId}`,
        dataSourceId: args.dsId,
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName}`
        );
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
    default:
      assertNever(command);
  }
};
