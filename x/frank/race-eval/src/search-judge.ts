import OpenAI from "openai";
import type { ProviderSearchResponse } from "./search-providers";

const MAX_JUDGE_RETRIES = 3;
const MAX_SNIPPET_CHARS = 1500;

export interface SearchResultScores {
  relevance: number;
  coverage: number;
  freshness: number;
  authority: number;
  content_richness: number;
  overall: number;
  rationale: string;
}

const SEARCH_SCORING_PROMPT = `You are a strict, objective evaluator of web search result quality for AI research agents.

Today's date: {current_date}. Judge freshness relative to this date, not your training cutoff.

An agent issued a search query while researching a task. You are given the raw results
(title, URL, snippet/excerpt, publish date when available) returned by one search provider.
Score the result set on each dimension from 0 to 10:

- relevance: how directly the results address the query and the underlying research task.
- coverage: whether the set spans the distinct subtopics/angles needed (not 10 copies of the same page).
- freshness: whether results are recent enough for the task (use publish dates and any dates visible in snippets; score 5 if recency does not matter for this task).
- authority: source quality — primary sources, official docs, reputable publications score high; SEO farms, scrapers, low-quality aggregators score low.
- content_richness: how much an agent can extract WITHOUT fetching the page — empty or one-line snippets score low, substantive excerpts score high.

Also give "overall" (0-10, your holistic judgment, not necessarily the mean) and a 2-3 sentence rationale.

Research task:
{task_prompt}

Search query:
{query}

Results ({result_count} total):
{results}

Output JSON only:
{"relevance": <float>, "coverage": <float>, "freshness": <float>, "authority": <float>, "content_richness": <float>, "overall": <float>, "rationale": "<text>"}`;

const QUERY_GENERATION_PROMPT = `You simulate the first web search an AI research agent would issue for a task.

Given the research task below, output the single most useful initial search query
(concise, 3-8 words, the way a capable agent would phrase it).

Research task:
{task_prompt}

Output JSON only:
{"query": "<search query>"}`;

export class SearchJudge {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateQuery(task: string): Promise<string> {
    const value = await this.retryJson<{ query?: unknown }>(
      QUERY_GENERATION_PROMPT.replace("{task_prompt}", task),
      "query generation"
    );
    if (typeof value.query !== "string" || value.query.trim().length === 0) {
      throw new Error("Query generation returned an empty query");
    }
    return value.query.trim();
  }

  async scoreResults(
    task: string,
    response: ProviderSearchResponse
  ): Promise<SearchResultScores> {
    const formatted = response.results
      .map((result, index) => {
        const lines = [
          `[${index + 1}] ${result.title}`,
          `URL: ${result.link}`,
        ];
        if (result.publish_date) {
          lines.push(`Published: ${result.publish_date}`);
        }
        lines.push(`Snippet: ${result.snippet.slice(0, MAX_SNIPPET_CHARS) || "(empty)"}`);
        return lines.join("\n");
      })
      .join("\n\n");

    const prompt = SEARCH_SCORING_PROMPT.replace(
      "{current_date}",
      new Date().toISOString().slice(0, 10)
    )
      .replace("{task_prompt}", task)
      .replace("{query}", response.query)
      .replace("{result_count}", String(response.results.length))
      .replace("{results}", formatted || "(no results returned)");

    const value = await this.retryJson<Record<string, unknown>>(prompt, "search scoring");
    return parseScores(value);
  }

  private async retryJson<T>(prompt: string, label: string): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_JUDGE_RETRIES; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        });
        const text = completion.choices[0]?.message?.content;
        if (!text) {
          throw new Error("OpenAI returned empty response content");
        }
        return JSON.parse(text) as T;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw new Error(
      `OpenAI ${label} failed after ${MAX_JUDGE_RETRIES} attempts: ${lastError?.message ?? "unknown error"}`
    );
  }
}

const SCORE_FIELDS = [
  "relevance",
  "coverage",
  "freshness",
  "authority",
  "content_richness",
  "overall",
] as const;

function parseScores(value: Record<string, unknown>): SearchResultScores {
  const scores: Partial<SearchResultScores> = {};
  for (const field of SCORE_FIELDS) {
    const score = Number(value[field]);
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      throw new Error(`Invalid search score for ${field}: ${value[field]}`);
    }
    scores[field] = score;
  }
  scores.rationale = typeof value["rationale"] === "string" ? value["rationale"] : "";
  return scores as SearchResultScores;
}
