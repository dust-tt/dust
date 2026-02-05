import { execSync } from "child_process";
import * as fs from "fs"; 
import * as path from "path";

function parseArgs(): { workspace: string } {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf("--workspace");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    console.error(
      "Usage: npx tsx scripts/suggest-skills/0_run_all.ts --workspace <workspaceId>"
    );
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
  };
}

function runStep(stepNumber: number, stepName: string, command: string): void {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Step ${stepNumber}: ${stepName}`);
  console.log("=".repeat(80));

  try {
    execSync(command, { stdio: "inherit", cwd: path.join(__dirname, "../..") });
    console.log(`\n✓ Step ${stepNumber} completed successfully`);
  } catch (error) {
    console.error(`\n✗ Step ${stepNumber} failed`);
    process.exit(1);
  }
}

function main() {
  const { workspace } = parseArgs();

  const workspaceDir = path.join(__dirname, "runs", workspace);
  const agentsPath = path.join(workspaceDir, "1_agents.json");

  // Check that step 1 (manual) has been completed
  if (!fs.existsSync(agentsPath)) {
    console.error("Error: Step 1 must be completed manually first.");
    console.error("");
    console.error("Instructions:");
    console.error("1. Run the SQL query in 1_extract_agents.sql on Metabase");
    console.error("2. Export the results as JSON");
    console.error(`3. Save the file to: ${agentsPath}`);
    console.error("");
    console.error("Then run this script again.");
    process.exit(1);
  }

  console.log("=".repeat(80));
  console.log("Skill Suggestion Pipeline");
  console.log(`Workspace: ${workspace}`);
  console.log("=".repeat(80));

  const scriptsDir = "scripts/suggest-skills";

  // Step 2: Embed prompts
  runStep(
    2,
    "Embed prompts",
    `npx tsx ${scriptsDir}/2_embed_prompts.ts --workspace ${workspace}`
  );

  // Step 3: Cluster agents
  runStep(
    3,
    "Cluster agents",
    `npx tsx ${scriptsDir}/3_clustering.ts --workspace ${workspace}`
  );

  // Step 4: Find skill ideas
  runStep(
    4,
    "Find skill ideas",
    `npx tsx ${scriptsDir}/4_find_skill_ideas.ts --workspace ${workspace}`
  );

  // Step 5: Grade skill ideas
  runStep(
    5,
    "Grade skill ideas",
    `npx tsx ${scriptsDir}/5_grade.ts --workspace ${workspace}`
  );

  // Step 6: Generate report
  runStep(
    6,
    "Generate report",
    `npx tsx ${scriptsDir}/6_generate_report.ts --workspace ${workspace}`
  );

  // Step 7: Create zip archive
  runStep(
    7,
    "Create zip archive",
    `npx tsx ${scriptsDir}/7_create_zip.ts --workspace ${workspace}`
  );

  console.log(`\n${"=".repeat(80)}`);
  console.log("Pipeline completed successfully!");
  console.log("=".repeat(80));
  console.log(`\nResults available at: ${workspaceDir}/6_skill_reports/`);
  console.log(`Zip archive: ${workspaceDir}/${workspace}.zip`);
}

main();
