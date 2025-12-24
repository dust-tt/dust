import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

import {
  restoreAgentConfiguration,
  updateAgentConfigurationScope,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";

type AgentRecord = {
  name: string;
  AGENT_SID: string;
};

const argumentSpecs: ArgumentSpecs = {
  csvPath: {
    type: "string",
    description: "Path to the CSV file containing agent name and sId",
    demandOption: true,
  },
  workspaceId: {
    type: "string",
    description: "Workspace ID to restore agents from",
    demandOption: true,
  },
};

makeScript(
  argumentSpecs,
  async ({ csvPath, workspaceId, execute }, scriptLogger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    // Read and parse CSV file
    const fileContent = readFileSync(csvPath, "utf-8");
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    }) as AgentRecord[];

    scriptLogger.info(
      { workspaceId, recordCount: records.length },
      "Starting agent archival process"
    );

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const record of records) {
      const agentName = record.name;
      const agentId = record.AGENT_SID;

      if (!agentName || !agentId) {
        scriptLogger.warn(
          { agentName, agentId },
          "Missing name or AGENT_SID, skipping"
        );
        skipCount++;
        continue;
      }

      scriptLogger.info(
        { agentName, agentId, execute },
        "Processing agent archival"
      );

      if (execute) {
        try {
          const restored = await restoreAgentConfiguration(auth, agentId);
          if (restored) {
            scriptLogger.info(
              { agentName, agentId },
              "Successfully restored agent"
            );
            const updated = await updateAgentConfigurationScope(
              auth,
              agentId,
              "hidden"
            );
            if (updated) {
              scriptLogger.info(
                { agentName, agentId },
                "Successfully updated agent scope to hidden"
              );
            } else {
              scriptLogger.warn(
                { agentName, agentId },
                "Failed to update agent scope to hidden"
              );
            }
            successCount++;
          } else {
            scriptLogger.warn(
              { agentName, agentId },
              "Agent not found or already restored"
            );
            skipCount++;
          }
        } catch (error) {
          scriptLogger.error(
            { agentName, agentId, error },
            "Failed to restore agent"
          );
          errorCount++;
        }
      } else {
        scriptLogger.info(
          { agentName, agentId },
          "Dry run: would restore agent"
        );
      }
    }

    scriptLogger.info(
      {
        workspaceId,
        recordCount: records.length,
        successCount,
        skipCount,
        errorCount,
      },
      "Completed agent archival process"
    );
  }
);
