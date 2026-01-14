# Generate skills suggestion

This script is used to generate skills suggestions based on the most used agents.
It must be run step-by-step to get the best possible skills.

## Step 0: Get agents information

First, extract agent data from the workspace:

```bash
npx tsx scripts/suggested_skills/0_get_agents.ts --workspaceName <workspaceName>
```

Optionally, get internal tools information:

```bash
npx tsx scripts/suggested_skills/0_bis_get_internal_tools.ts --workspaceName <workspaceName>
```

## Step 1: Generate skills for each agent

Generate skill suggestions based on each agent's capabilities:

```bash
npx tsx scripts/suggested_skills/1_get_suggested_skills.ts --workspaceName <workspaceName>
```

## Step 2: Filter top skills

Extract the top skills based on confidence scores:

```bash
npx tsx scripts/suggested_skills/2_extract_top.ts --workspaceName <workspaceName>
```

## Step 3: Format JSON to readable document

Format the top skills into a human-readable text document:

```bash
npx tsx scripts/suggested_skills/3_format_top.ts --workspaceName <workspaceName>
```

## Step 4: Grade the best skills and extract the top 3

Download the `4_examples.json` file from https://www.notion.so/dust-tt/Suggested-skills-2e628599d9418051bd9aca4a73321733?source=copy_link#2e828599d94180d1825cd7b5296fa540

Place it in the `scripts/suggested_skills/` directory, then run:

```bash
npx tsx scripts/suggested_skills/4_grade_skills.ts --input <path_to_skills_json> [--output <output_path>]
```
