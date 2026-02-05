import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

function parseArgs(): { workspace: string } {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf("--workspace");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    console.error(
      "Usage: npx tsx scripts/suggest-skills/7_create_zip.ts --workspace <workspaceId>"
    );
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
  };
}

function main() {
  const { workspace } = parseArgs();

  const workspaceDir = path.join(__dirname, "runs", workspace);
  const reportsDir = path.join(workspaceDir, "6_skill_reports");
  const outputPath = path.join(workspaceDir, `${workspace}.zip`);

  // Check reports directory exists
  if (!fs.existsSync(reportsDir)) {
    console.error(`Error: Reports directory not found: ${reportsDir}`);
    console.error("Please run the report generation step first:");
    console.error(
      `  npx tsx scripts/suggest-skills/6_generate_report.ts --workspace ${workspace}`
    );
    process.exit(1);
  }

  console.log(`Creating zip archive for workspace ${workspace}...`);

  // Remove existing zip if present
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  // Use system zip command
  execSync(`zip -j "${outputPath}" "${reportsDir}"/*.md`, {
    stdio: "inherit",
  });

  const stats = fs.statSync(outputPath);
  console.log(`\nZip archive created: ${outputPath}`);
  console.log(`Total size: ${(stats.size / 1024).toFixed(1)} KB`);
}

main();
