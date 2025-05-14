import "dotenv/config";
import { NotionClient } from "./clients/notion-client";
import { WorkspaceGenerator } from "./generators/workspace";
import { ActivitySimulator } from "./generators/activity";
import { Config } from "./config";
import { LogLevel } from "@notionhq/client";

async function main(): Promise<void> {
  console.log("Starting Notion workspace generation...");

  // Initialize the Notion client with rate limiting
  const notionClient = new NotionClient({
    auth: process.env.NOTION_API_KEY || "",
    maxRetries: Config.MAX_RETRIES,
    initialRetryDelayMs: Config.INITIAL_RETRY_DELAY_MS,
    maxRetryDelayMs: Config.MAX_RETRY_DELAY_MS,
    logLevel: "info" as LogLevel,
  });

  // Initialize the workspace generator
  const workspaceGenerator = new WorkspaceGenerator(notionClient);

  // Generate the base workspace structure
  const workspaceResult = await workspaceGenerator.generateWorkspace({
    databasesCount: Config.DATABASES_COUNT,
    pagesCount: Config.PAGES_COUNT,
    childrenPerPage: Config.CHILDREN_PER_PAGE,
    maxDepth: Config.MAX_DEPTH,
  });

  console.log(
    `Generated workspace with ${workspaceResult.databaseIds.length} databases and ${workspaceResult.pageIds.length} pages`
  );

  // Simulate ongoing activity if enabled
  if (Config.SIMULATE_ACTIVITY) {
    console.log("Starting activity simulation...");
    const activitySimulator = new ActivitySimulator(
      notionClient,
      workspaceResult
    );

    // Start the simulation with the specified interval
    activitySimulator.startSimulation({
      intervalMs: Config.ACTIVITY_INTERVAL_MS,
      durationMs: Config.ACTIVITY_DURATION_MS,
      updatesPerInterval: Config.UPDATES_PER_INTERVAL,
    });
  }
}

main().catch((error) => {
  console.error("Error in workspace generation:", error);
  process.exit(1);
});
