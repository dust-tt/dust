# Suggest Skills Pipeline

Generates skill ideas by clustering agent prompts and analyzing patterns.

## Pipeline Steps

0. **Run all** (`0_run_all.ts`) - Run all steps (except step 1 which is manual)
1. **Extract agents** (`1_extract_agents.sql`) - SQL query to export agent prompts as JSON (manual)
2. **Embed prompts** (`2_embed_prompts.ts`) - Generate embeddings using OpenAI
3. **Cluster agents** (`3_clustering.ts`) - Group similar agents using k-means clustering
4. **Find skill ideas** (`4_find_skill_ideas.ts`) - Analyze clusters to suggest skills
5. **Grade skill ideas** (`5_grade.ts`) - Evaluate and rank skill ideas by quality
6. **Generate report** (`6_generate_report.ts`) - Create markdown report for top skills
7. **Create zip** (`7_create_zip.ts`) - Package reports into a zip archive

## Usage

```bash
# 1. First, run SQL query in your database client, save output as runs/<workspace>/1_agents.json

# 0. Run all remaining steps at once
npx tsx scripts/suggest-skills/0_run_all.ts --workspace <workspaceId>
```

### Or run steps individually:

```bash
# 2. Generate embeddings
npx tsx scripts/suggest-skills/2_embed_prompts.ts --workspace <workspaceId>

# 3. Create clusters (adaptive, targets 5-20 agents per cluster)
npx tsx scripts/suggest-skills/3_clustering.ts --workspace <workspaceId>

# 4. Generate skill ideas
npx tsx scripts/suggest-skills/4_find_skill_ideas.ts --workspace <workspaceId>

# 5. Grade skill ideas (outputs sorted by grade)
npx tsx scripts/suggest-skills/5_grade.ts --workspace <workspaceId>

# 6. Generate markdown report for top 10 skills
npx tsx scripts/suggest-skills/6_generate_report.ts --workspace <workspaceId>

# 7. Create zip archive of reports
npx tsx scripts/suggest-skills/7_create_zip.ts --workspace <workspaceId>
```

## Required Environment Variables

- `DUST_MANAGED_OPENAI_API_KEY` - For embeddings
- `DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY` - For Gemini LLM calls
