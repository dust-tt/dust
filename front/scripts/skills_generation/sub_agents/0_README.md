# Sub-Agents Skills Generation Pipeline

Extract and evaluate reusable skills from sub-agents.

## Pipeline Steps

### 1. Extract agents from database

Run `1_extract_agents.sql` in Metabase → export to `1_agents.json`

### 2. Enrich with tool names

```bash
npx tsx scripts/skills_generation/sub_agents/2_enrich_with_tool_names.ts
```

### 3. Generate skills (calls Gemini)

```bash
npx tsx scripts/skills_generation/sub_agents/3_generate_skills.ts [--limit N]
```

### 4. Evaluate skills (calls Gemini)

```bash
npx tsx scripts/skills_generation/sub_agents/4_evaluate_skills.ts [--limit N]
```

### 5. Export top results

```bash
npx tsx scripts/skills_generation/sub_agents/5_export_results.ts [--top N]
```

Results in `5_results/` folder.

## Example: Run full pipeline with limit

```bash
N=30

npx tsx scripts/skills_generation/sub_agents/2_enrich_with_tool_names.ts
npx tsx scripts/skills_generation/sub_agents/3_generate_skills.ts --limit $N
npx tsx scripts/skills_generation/sub_agents/4_evaluate_skills.ts
npx tsx scripts/skills_generation/sub_agents/5_export_results.ts --top 5
```
