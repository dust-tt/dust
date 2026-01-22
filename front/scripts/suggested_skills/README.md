# Generate Skills Suggestion

This script pipeline generates skill suggestions based on the most used agents in a workspace.

## Prerequisites

- Download `4_examples.json` from [Notion](https://www.notion.so/dust-tt/Suggested-skills-2e628599d9418051bd9aca4a73321733?source=copy_link#2e828599d94180d1825cd7b5296fa540) and place it in this directory

## Usage

All scripts use `--workspaceId` as the main argument (the workspace's string ID, e.g., `0Kxxxx`).

### Step 1: Extract agents from workspace

```bash
npx tsx scripts/suggested_skills/1_get_agents.ts --workspaceId <workspaceId>
```

This fetches active visible agents with their tools and datasources, sorted by usage in the last 30 days.

Options:
- `--limit <n>` - Maximum number of agents to fetch (default: 30)

Output: `<workspaceId>/agents.json`

### Step 2: Generate skill suggestions

```bash
npx tsx scripts/suggested_skills/2_generate_skills.ts --workspaceId <workspaceId>
```

Uses Claude to analyze each agent and propose 0-2 skills based on their capabilities.

Output: `<workspaceId>/suggested_skills.json`

### Step 3: Extract and format top skills

```bash
npx tsx scripts/suggested_skills/3_extract_and_format.ts --workspaceId <workspaceId>
```

Filters and extracts the top skills, outputting both JSON and human-readable text files.

Options:
- `--topK <n>` - Number of top skills to extract (default: 10)

Output:
- `<workspaceId>/top_skills.json`
- `<workspaceId>/formatted_skills/*.txt`

### Step 4: Grade skills and select the best

```bash
npx tsx scripts/suggested_skills/4_grade_skills.ts --workspaceId <workspaceId>
```

Uses Google Gemini to grade each skill and select the top N.

Options:
- `--topK <n>` - Number of top skills to select (default: 10)

Output:
- `<workspaceId>/final_skills.json`
- `<workspaceId>/grading_report.json`

## Example workflow

```bash
# Run all steps for workspace 0Kxxx
npx tsx scripts/suggested_skills/1_get_agents.ts --workspaceId 0Kxxx
npx tsx scripts/suggested_skills/2_generate_skills.ts --workspaceId 0Kxxx
npx tsx scripts/suggested_skills/3_extract_and_format.ts --workspaceId 0Kxxx
npx tsx scripts/suggested_skills/4_grade_skills.ts --workspaceId 0Kxxx
```

The final output in `<workspaceId>/final_skills.json` can be used with `create_hard_coded_suggested_skills.ts` to create the skills in the workspace.
