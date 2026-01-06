# Agent Cluster Skills Generation Pipeline

Generate a skill from a cluster of agents that share a common keyword in their prompts.

## Pipeline Overview

This pipeline:

1. Extracts all agents from a workspace (once per workspace)
2. Filters agents by a keyword in their instructions
3. Sends all filtered agents to an LLM with topic-specific guidance to generate a single cohesive skill

## Pipeline Steps

### 1. Extract agents from database

Run `1_extract_agents.sql` in Metabase with the workspace sId → export to `runs/<workspace>/1_agents.json`

This file is shared across all keywords for the same workspace.

### 2. Filter agents by keyword

```bash
npx tsx scripts/skills_generation/agent_cluster/2_filter_by_keyword.ts --workspace <workspace> --keyword <keyword>
```

This reads from `runs/<workspace>/1_agents.json` and writes to `runs/<workspace>/<keyword>/2_filtered_agents.json`.

### 3. Generate skill (calls Gemini)

```bash
npx tsx scripts/skills_generation/agent_cluster/3_generate_skill.ts --workspace <workspace> --keyword <keyword>
```

Reads filtered agents and generates a single skill that combines the best practices from all agents.

Output:

- `runs/<workspace>/<keyword>/3_generated_skill.json` - Full JSON with skill data and reasoning
- `runs/<workspace>/<keyword>/3_generated_skill.md` - Human-readable markdown

## Directory Structure

```
agent_cluster/
├── 0_README.md
├── 1_extract_agents.sql
├── 2_filter_by_keyword.ts
├── 3_generate_skill.ts
├── 3_prompt.txt
└── runs/
    └── <workspace>/
        ├── 1_agents.json              # All agents from workspace (shared)
        ├── hubspot/
        │   ├── 2_filtered_agents.json # Agents matching "hubspot"
        │   ├── 3_generated_skill.json # Generated skill JSON
        │   └── 3_generated_skill.md   # Generated skill markdown
        └── slack/
            ├── 2_filtered_agents.json # Agents matching "slack"
            ├── 3_generated_skill.json
            └── 3_generated_skill.md
```

## Example: Full Pipeline Run

```bash
# 1. Export agents from Metabase to runs/dust/1_agents.json (once per workspace)
KEYWORD=snowflake
WORKSPACE=persona

# 2. Filter agents containing "hubspot" in their instructions
npx tsx scripts/skills_generation/agent_cluster/2_filter_by_keyword.ts --workspace $WORKSPACE --keyword $KEYWORD

# 3. Generate a skill from the filtered agents
npx tsx scripts/skills_generation/agent_cluster/3_generate_skill.ts --workspace $WORKSPACE --keyword $KEYWORD

# Run for another keyword (reuses the same 1_agents.json)
npx tsx scripts/skills_generation/agent_cluster/2_filter_by_keyword.ts --workspace $WORKSPACE --keyword slack
npx tsx scripts/skills_generation/agent_cluster/3_generate_skill.ts --workspace $WORKSPACE --keyword slack
```

## Notes

- The keyword filter is case-insensitive
- Agents must have non-empty instructions to be included
- The generated skill combines best practices from all filtered agents into a single cohesive skill
- The `1_agents.json` file is shared per workspace, so you only need to export it once
