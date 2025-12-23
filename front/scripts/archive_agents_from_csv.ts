import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";

import type { ArgumentSpecs } from "./helpers";
import { makeScript } from "./helpers";

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
      const agentSid = record.AGENT_SID;

      if (!agentName || !agentSid) {
        scriptLogger.warn(
          { agentName, agentSid },
          "Missing name or AGENT_SID, skipping"
        );
        skipCount++;
        continue;
      }

      scriptLogger.info(
        { agentName, agentSid, execute },
        "Processing agent archival"
      );

      if (execute) {
        try {
          const archived = await archiveAgentConfiguration(auth, agentSid);
          if (archived) {
            scriptLogger.info(
              { agentName, agentSid },
              "Successfully archived agent"
            );
            successCount++;
          } else {
            scriptLogger.warn(
              { agentName, agentSid },
              "Agent not found or already archived"
            );
            skipCount++;
          }
        } catch (error) {
          scriptLogger.error(
            { agentName, agentSid, error },
            "Failed to archive agent"
          );
          errorCount++;
        }
      } else {
        scriptLogger.info(
          { agentName, agentSid },
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
