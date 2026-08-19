import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger, { auditLog } from "@app/logger/logger";
import type { AdminCommandType } from "@app/types/connectors/admin/cli";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";

export const skipGithubRepositoryPlugin = createPlugin({
  manifest: {
    id: "skip-github-repository",
    name: "Skip GitHub repository",
    description: "Stop syncing the code of a GitHub repository",
    resourceTypes: ["data_sources"],
    warning:
      "Code already synced for this repository stays in the data source but is not refreshed " +
      "anymore. Running code sync workflows are not interrupted: terminate them in Temporal if " +
      "one is stuck.",
    args: {
      repoId: {
        type: "string",
        label: "Repository ID",
        description:
          "Numeric GitHub repository ID, e.g. 12345678 for the node github-repository-12345678",
      },
      skipReason: {
        type: "string",
        label: "Skip reason",
        description: "Why this repository is skipped, stored on the repository",
      },
    },
    requiredRoles: ["support"],
  },
  isApplicableTo: (auth, dataSource) => {
    if (!dataSource) {
      return false;
    }

    return dataSource.connectorProvider === "github";
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    if (dataSource.connectorProvider !== "github") {
      return new Err(new Error("Data source is not a GitHub connector."));
    }

    const repoId = args.repoId.trim();
    const skipReason = args.skipReason.trim();

    if (!repoId || !skipReason) {
      return new Err(new Error("Repository ID and skip reason are required."));
    }

    if (!/^\d+$/.test(repoId)) {
      return new Err(
        new Error("Repository ID must be the numeric GitHub repository ID.")
      );
    }

    const owner = auth.getNonNullableWorkspace();

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const skipRepoCommand: AdminCommandType = {
      majorCommand: "github",
      command: "skip-repo",
      args: {
        wId: owner.sId,
        dsId: dataSource.sId,
        repoId,
        skipReason,
      },
    };

    const res = await connectorsAPI.admin(skipRepoCommand);
    if (res.isErr()) {
      return new Err(
        new Error(`Failed to skip repository: ${res.error.message}`)
      );
    }

    auditLog(
      {
        author: auth.user()?.toJSON() ?? "no-author",
        dataSourceId: dataSource.sId,
        repoId,
        skipReason,
      },
      "Skipping GitHub repository"
    );

    return new Ok({
      display: "text",
      value: `Repository ${repoId} is now skipped. Reason: ${skipReason}`,
    });
  },
});
