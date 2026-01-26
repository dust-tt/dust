import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";
import type { WorkspaceName } from "@app/scripts/suggested_skills/constants";
import { WORKSPACE_CONFIG } from "@app/scripts/suggested_skills/constants";

const argumentSpecs: ArgumentSpecs = {
  workspaceName: {
    type: "string",
    description:
      "Name of the workspace (e.g., dust, etc.)",
  },
};

// npx tsx scripts/suggested_skills/0_get_agents.ts --workspaceName <workspaceName>
makeScript(argumentSpecs, async (args, scriptLogger) => {
  const workspaceName = args.workspaceName as WorkspaceName;

  scriptLogger.info(
    { workspaceName },
    "Starting agent data extraction for workspace"
  );

  // Check if workspace exists in configuration
  if (WORKSPACE_CONFIG[workspaceName] === undefined) {
    const availableWorkspaces = Object.keys(WORKSPACE_CONFIG).join(", ");
    throw new Error(
      `Workspace "${workspaceName}" not found in configuration. Available workspaces: ${availableWorkspaces}`
    );
  }

  const config = WORKSPACE_CONFIG[workspaceName];
  const { sid: workspaceSid, podId } = config;

  scriptLogger.info(
    { workspaceName, workspaceSid, podId },
    "Found workspace configuration"
  );

  // Read the query template
  const queryFilePath = join(__dirname, "query.sql");
  if (!existsSync(queryFilePath)) {
    throw new Error(`Query file not found at ${queryFilePath}`);
  }

  const queryTemplate = readFileSync(queryFilePath, "utf-8");

  // Replace the placeholder with the actual workspace SID
  const query = queryTemplate.replace(/<YOUR_WORKSPACE_SID>/g, workspaceSid);

  scriptLogger.info("Prepared SQL query with workspace SID");

  // Create output directory if it doesn't exist
  const outputDir = join(__dirname, workspaceName);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    scriptLogger.info({ outputDir }, "Created output directory");
  }

  // Write the query to a temporary file
  const tempQueryPath = join(outputDir, "temp_query.sql");
  writeFileSync(tempQueryPath, query);
  scriptLogger.info({ tempQueryPath }, "Wrote temporary query file");

  const outputFilePath = join(outputDir, "agents.json");

  scriptLogger.info(
    { outputFilePath, podId },
    "Executing kubectl command to fetch agents"
  );

  try {
    // Execute the kubectl command using cat to pipe the query file
    const command = `cat ${tempQueryPath} | kubectl exec -i ${podId} -- bash -c 'psql $FRONT_DATABASE_URI -t -A -P pager=off' > ${outputFilePath}`;

    execSync(command, {
      stdio: "inherit",
      shell: "/bin/bash",
    });

    scriptLogger.info(
      { outputFilePath },
      "Successfully fetched agents data and wrote to file"
    );
  } catch (error) {
    throw new Error(
      `Failed to execute kubectl command: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});
