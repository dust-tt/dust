import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
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
    description: "Workspace ID to archive agents from",
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
          const archived = await archiveAgentConfiguration(auth, agentId);
          if (archived) {
            scriptLogger.info(
              { agentName, agentId },
              "Successfully archived agent"
            );
            successCount++;
          } else {
            scriptLogger.warn(
              { agentName, agentId },
              "Agent not found or already archived"
            );
            skipCount++;
          }
        } catch (error) {
          scriptLogger.error(
            { agentName, agentId, error },
            "Failed to archive agent"
          );
          errorCount++;
        }
      } else {
        scriptLogger.info(
          { agentName, agentId },
          "Dry run: would archive agent"
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
