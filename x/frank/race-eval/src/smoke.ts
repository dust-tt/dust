// Smoke test: exercises providerSearch + SearchJudge + generateCriteria with
// whatever API keys are available in the environment. Run with:
//   bun run src/smoke.ts
import { OpenAIJudge } from "./openai-judge";
import { SearchJudge } from "./search-judge";
import {
  SEARCH_PROVIDERS,
  providerKeyEnvNames,
  providerSearch,
  resolveProviderKey,
} from "./search-providers";

const TASK =
  "Research the latest Anthropic model releases in 2026 and summarize capabilities and pricing.";
const QUERY = "Anthropic model releases 2026";

async function main() {
  for (const provider of SEARCH_PROVIDERS) {
    if (!resolveProviderKey(provider)) {
      console.log(
        `[smoke] ${provider}: SKIPPED (set one of ${providerKeyEnvNames(provider).join(", ")})`
      );
      continue;
    }
    const response = await providerSearch(provider, QUERY, 3);
    if (response.error) {
      console.log(`[smoke] ${provider}: ERROR ${response.error}`);
      continue;
    }
    console.log(
      `[smoke] ${provider}: OK latency_ms=${response.latency_ms} results=${response.results.length}`
    );
    for (const result of response.results) {
      console.log(
        `         - ${result.title.slice(0, 60)} | snippet_chars=${result.snippet.length} | date=${result.publish_date ?? "n/a"}`
      );
    }
  }

  const openaiKey =
    process.env["OPENAI_API_KEY"] ?? process.env["DUST_MANAGED_OPENAI_API_KEY"];
  if (!openaiKey) {
    console.log("[smoke] judge: SKIPPED (no OpenAI key)");
    return;
  }

  const searchJudge = new SearchJudge(openaiKey, "gpt-4.1");
  const generatedQuery = await searchJudge.generateQuery(TASK);
  console.log(`[smoke] search-judge query generation: OK -> "${generatedQuery}"`);

  const preferredProviderOrder: Array<(typeof SEARCH_PROVIDERS)[number]> = [
    "firecrawl",
    ...SEARCH_PROVIDERS.filter((provider) => provider !== "firecrawl"),
  ];
  const providerForJudge = preferredProviderOrder.find((provider) =>
    resolveProviderKey(provider)
  );
  if (providerForJudge) {
    const response = await providerSearch(providerForJudge, generatedQuery, 3);
    if (!response.error) {
      const scores = await searchJudge.scoreResults(TASK, response);
      console.log(
        `[smoke] search-judge scoring (${providerForJudge}): OK overall=${scores.overall} freshness=${scores.freshness} authority=${scores.authority} content_richness=${scores.content_richness}`
      );
    }
  }

  const raceJudge = new OpenAIJudge(openaiKey, "gpt-4.1");
  const criteria = await raceJudge.generateCriteria(TASK);
  const dims = Object.keys(criteria.dimension_weights).join(",");
  console.log(
    `[smoke] RACE criteria generation: OK dimensions=${dims} source_quality_weight=${criteria.dimension_weights.source_quality.toFixed(3)} source_quality_criteria=${criteria.criteria.source_quality.length}`
  );
}

main().catch((error) => {
  console.error(`[smoke] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
