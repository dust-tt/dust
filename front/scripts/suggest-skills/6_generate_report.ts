import * as fs from "fs";
import * as path from "path";

interface AgentData {
  workspace_sid: string;
  agent_id: string;
  agent_name: string;
  instructions: string;
}

interface GradedSkillIdea {
  name: string;
  description: string;
  agent_names: string[];
  grade: number;
  reasoning: string;
  cluster_id: number;
}

const MAX_PROMPT_LENGTH = 4000;
const TOP_SKILLS_COUNT = 10;

function parseArgs(): { workspace: string } {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf("--workspace");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    console.error(
      "Usage: npx tsx scripts/suggest-skills/6_generate_report.ts --workspace <workspaceId>"
    );
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
  };
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function generateSkillMarkdown(
  skill: GradedSkillIdea,
  agentMap: Map<string, AgentData>
): string {
  let markdown = `# ${skill.name}\n\n`;
  markdown += `## Description\n\n`;
  markdown += `${skill.description}\n\n`;
  markdown += `## Agent's prompts\n\n`;

  for (const agentName of skill.agent_names) {
    const agent = agentMap.get(agentName);
    if (agent) {
      markdown += `### ${agentName} (${agent.agent_id})\n\n`;
      const truncatedPrompt =
        agent.instructions.length > MAX_PROMPT_LENGTH
          ? agent.instructions.slice(0, MAX_PROMPT_LENGTH) + "\n\n[truncated...]"
          : agent.instructions;
      markdown += `\`\`\`\n${truncatedPrompt}\n\`\`\`\n\n`;
    }
  }

  return markdown;
}

function main() {
  const { workspace } = parseArgs();

  const workspaceDir = path.join(__dirname, "runs", workspace);
  const agentsPath = path.join(workspaceDir, "1_agents.json");
  const gradedSkillsPath = path.join(workspaceDir, "5_graded_skills.json");
  const outputDir = path.join(workspaceDir, "6_skill_reports");

  // Check input files exist
  if (!fs.existsSync(agentsPath)) {
    console.error(`Error: Agents file not found: ${agentsPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(gradedSkillsPath)) {
    console.error(`Error: Graded skills file not found: ${gradedSkillsPath}`);
    console.error("Please run the grading step first:");
    console.error(
      `  npx tsx scripts/suggest-skills/5_grade.ts --workspace ${workspace}`
    );
    process.exit(1);
  }

  console.log("Loading data...");
  const agents: AgentData[] = JSON.parse(fs.readFileSync(agentsPath, "utf-8"));
  const gradedSkills: GradedSkillIdea[] = JSON.parse(
    fs.readFileSync(gradedSkillsPath, "utf-8")
  );

  // Build agent lookup map by name
  const agentMap = new Map<string, AgentData>();
  for (const agent of agents) {
    agentMap.set(agent.agent_name, agent);
  }

  const topSkills = gradedSkills.slice(0, TOP_SKILLS_COUNT);

  console.log(`Generating reports for top ${topSkills.length} skills...`);

  // Create output directory
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate individual skill files
  for (let i = 0; i < topSkills.length; i++) {
    const skill = topSkills[i];
    const rank = i + 1;
    const filename = `${String(rank).padStart(2, "0")}_${toKebabCase(skill.name)}.md`;
    const filePath = path.join(outputDir, filename);

    const markdown = generateSkillMarkdown(skill, agentMap);
    fs.writeFileSync(filePath, markdown);
  }

  // Generate index file
  let indexMarkdown = `# Top ${TOP_SKILLS_COUNT} Skill Ideas\n\n`;
  indexMarkdown += `Generated on ${new Date().toISOString().split("T")[0]}\n\n`;
  indexMarkdown += `| Rank | Skill Name | Agents |\n`;
  indexMarkdown += `|------|------------|--------|\n`;

  for (let i = 0; i < topSkills.length; i++) {
    const skill = topSkills[i];
    const rank = i + 1;
    const filename = `${String(rank).padStart(2, "0")}_${toKebabCase(skill.name)}.md`;
    indexMarkdown += `| #${rank} | [${skill.name}](./${filename}) | ${skill.agent_names.length} |\n`;
  }

  fs.writeFileSync(path.join(outputDir, "README.md"), indexMarkdown);

  console.log(`\nReports written to ${outputDir}/`);
  console.log(`  - README.md (index)`);
  for (let i = 0; i < topSkills.length; i++) {
    const skill = topSkills[i];
    const rank = i + 1;
    const filename = `${String(rank).padStart(2, "0")}_${toKebabCase(skill.name)}.md`;
    console.log(`  - ${filename}`);
  }
}

main();
