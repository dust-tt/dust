import * as fs from "fs";
import * as path from "path";

interface SourceAgent {
  agentId: string;
  agentName: string;
  workspaceSid: string;
}

interface EvaluatedSkill {
  name: string;
  userFacingDescription: string;
  agentFacingDescription: string;
  instructions: string;
  requiredTools: string[];
  agentsUsingSkill: string[];
  confidenceScore: number;
  sourceAgent: SourceAgent;
  evaluatedConfidenceScore: number;
  evaluationReasoning: string;
}

interface EnrichedAgentData {
  workspace_sid: string;
  agent_id: string;
  agent_name: string;
  instructions: string;
  tools: Array<{
    sId: string;
    name: string;
  }>;
  agents_using_it: string;
}

function generateSkillMarkdown(skill: EvaluatedSkill, rank: number): string {
  const toolsList =
    skill.requiredTools.length > 0
      ? skill.requiredTools.map((t) => `- ${t}`).join("\n")
      : "- None";

  const agentsList =
    skill.agentsUsingSkill.length > 0
      ? skill.agentsUsingSkill.map((a) => `- ${a}`).join("\n")
      : "- None";

  return `# ${rank}. ${skill.name}

## Scores

- **Original Confidence Score**: ${skill.confidenceScore.toFixed(2)}
- **Evaluated Confidence Score**: ${skill.evaluatedConfidenceScore.toFixed(2)}

## Evaluation Reasoning

${skill.evaluationReasoning}

## User-Facing Description

${skill.userFacingDescription}

## Agent-Facing Description

${skill.agentFacingDescription}

## Instructions

${skill.instructions}

## Required Tools

${toolsList}

## Agents Using This Skill

${agentsList}

## Source Agent

- **Agent Name**: ${skill.sourceAgent.agentName}
- **Agent ID**: ${skill.sourceAgent.agentId}
- **Workspace SID**: ${skill.sourceAgent.workspaceSid}
`;
}

function generateAgentMarkdown(agent: EnrichedAgentData, rank: number): string {
  const toolsList =
    agent.tools.length > 0
      ? agent.tools.map((t) => `- ${t.name} (\`${t.sId}\`)`).join("\n")
      : "- None";

  let agentsUsingIt: Array<{ sId: string; name: string }> = [];
  try {
    agentsUsingIt = JSON.parse(agent.agents_using_it);
  } catch {
    // Ignore parse errors
  }

  const agentsUsingItList =
    agentsUsingIt.length > 0
      ? agentsUsingIt.map((a) => `- ${a.name} (\`${a.sId}\`)`).join("\n")
      : "- None";

  return `# ${rank}. Source Agent: ${agent.agent_name}

## Agent Details

- **Agent ID**: ${agent.agent_id}
- **Workspace SID**: ${agent.workspace_sid}

## Tools

${toolsList}

## Agents Using This Sub-Agent

${agentsUsingItList}

## Full Instructions

\`\`\`
${agent.instructions}
\`\`\`
`;
}

async function main() {
  const args = process.argv.slice(2);
  let topN = 10;

  // Parse --top argument
  const topIndex = args.indexOf("--top");
  if (topIndex !== -1 && args[topIndex + 1]) {
    topN = parseInt(args[topIndex + 1], 10);
    if (isNaN(topN) || topN <= 0) {
      console.error("Error: --top must be a positive number");
      process.exit(1);
    }
  }

  const skillsInputPath = path.join(__dirname, "4_evaluated_skills.json");
  const agentsInputPath = path.join(__dirname, "2_agents_enriched.json");
  const outputDir = path.join(__dirname, "5_results");

  console.log(`Reading evaluated skills from ${skillsInputPath}...`);
  const skillsData = fs.readFileSync(skillsInputPath, "utf-8");
  const allSkills: EvaluatedSkill[] = JSON.parse(skillsData);

  console.log(`Reading agents from ${agentsInputPath}...`);
  const agentsData = fs.readFileSync(agentsInputPath, "utf-8");
  const allAgents: EnrichedAgentData[] = JSON.parse(agentsData);

  // Create agent lookup map
  const agentMap = new Map<string, EnrichedAgentData>();
  for (const agent of allAgents) {
    agentMap.set(agent.agent_id, agent);
  }

  // Get top N skills (already sorted by evaluatedConfidenceScore)
  const topSkills = allSkills.slice(0, topN);

  console.log(`Exporting top ${topSkills.length} skills to ${outputDir}...`);

  // Create output directory
  if (fs.existsSync(outputDir)) {
    // Clean existing files
    const existingFiles = fs.readdirSync(outputDir);
    for (const file of existingFiles) {
      fs.unlinkSync(path.join(outputDir, file));
    }
  } else {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write skill and agent files
  for (let i = 0; i < topSkills.length; i++) {
    const skill = topSkills[i];
    const rank = i + 1;

    // Write skill markdown
    const skillFilename = `${rank}_skill.md`;
    const skillMarkdown = generateSkillMarkdown(skill, rank);
    fs.writeFileSync(path.join(outputDir, skillFilename), skillMarkdown);
    console.log(`  Created ${skillFilename}: ${skill.name}`);

    // Write corresponding agent markdown
    const agent = agentMap.get(skill.sourceAgent.agentId);
    if (agent) {
      const agentFilename = `${rank}_agent.md`;
      const agentMarkdown = generateAgentMarkdown(agent, rank);
      fs.writeFileSync(path.join(outputDir, agentFilename), agentMarkdown);
      console.log(`  Created ${agentFilename}: ${agent.agent_name}`);
    } else {
      console.warn(
        `  Warning: Agent ${skill.sourceAgent.agentId} not found for skill ${skill.name}`
      );
    }
  }

  // Write summary file
  const summaryLines = [
    "# Top Skills Summary\n",
    `Generated: ${new Date().toISOString()}\n`,
    "| Rank | Skill Name | Score | Source Agent |",
    "|------|------------|-------|--------------|",
  ];

  for (let i = 0; i < topSkills.length; i++) {
    const skill = topSkills[i];
    summaryLines.push(
      `| ${i + 1} | ${skill.name} | ${skill.evaluatedConfidenceScore.toFixed(2)} | ${skill.sourceAgent.agentName} |`
    );
  }

  fs.writeFileSync(
    path.join(outputDir, "0_summary.md"),
    summaryLines.join("\n")
  );
  console.log(`\nCreated 0_summary.md`);

  console.log(`\nDone! Exported ${topSkills.length} skills to ${outputDir}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
