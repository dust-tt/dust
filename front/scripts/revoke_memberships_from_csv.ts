import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

import { revokeAndTrackMembership } from "@app/lib/api/membership";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { UserResource } from "@app/lib/resources/user_resource";

import type { ArgumentSpecs } from "./helpers";
import { makeScript } from "./helpers";

const argumentSpecs: ArgumentSpecs = {
  csvPath: {
    type: "string",
    description: "Path to the CSV file containing email and last day",
    demandOption: true,
  },
  workspaceId: {
    type: "string",
    description: "Workspace ID to revoke memberships from",
    demandOption: true,
  },
};

makeScript(
  argumentSpecs,
  async ({ csvPath, workspaceId, execute }, scriptLogger) => {
    // Read and parse CSV file
    const fileContent = readFileSync(csvPath, "utf-8");
    const records = parse(fileContent, {
      columns: false,
      skip_empty_lines: true,
    });

    // Get workspace
    const workspace = await getWorkspaceInfos(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    scriptLogger.info(
      { workspaceId, recordCount: records.length },
      "Starting membership revocation process"
    );

    for (const [email, lastDay] of records) {
      scriptLogger.info(
        { email, lastDay, execute },
        "Processing user membership revocation"
      );

      // Get user
      const user = await UserResource.fetchByEmail(email);
      if (!user) {
        scriptLogger.warn({ email }, "User not found, skipping");
        continue;
      }

      if (execute) {
        const result = await revokeAndTrackMembership(workspace, user);
        if (result.isOk()) {
          scriptLogger.info(
            { email, role: result.value.role },
            "Successfully revoked membership"
          );
        } else {
          scriptLogger.error(
            { email, error: result.error },
            "Failed to revoke membership"
          );
        }
      } else {
        scriptLogger.info({ email }, "Dry run: would revoke membership");
      }
    }

    scriptLogger.info(
      { workspaceId, recordCount: records.length },
      "Completed membership revocation process"
    );
  }
);
