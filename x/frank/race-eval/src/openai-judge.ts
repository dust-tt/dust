import OpenAI from "openai";
import type { DimensionName, RawJudgeScores, TaskCriteria } from "./types";

const DIMENSIONS: DimensionName[] = [
  "comprehensiveness",
  "insight",
  "instruction_following",
  "readability",
  "source_quality",
];
const MAX_JUDGE_RETRIES = 3;
const MAX_REPORT_CHARS = 50_000;

const DIMENSION_PROMPTS: Record<DimensionName, string> = {
  comprehensiveness: `You are an experienced research article evaluation expert.

Background: We are evaluating a deep research article across five dimensions: Comprehensiveness, Insight, Instruction Following, Readability, and Source Quality.

Your Goal: For the Comprehensiveness dimension, create task-specific criteria.

Requirements:
1. Analyze the task and identify key information areas and depth required.
2. Propose specific criteria focused only on comprehensiveness.
3. Provide a short explanation for each criterion.
4. Assign criterion weights that sum to exactly 1.0.
5. Avoid overlap with other dimensions.

Task:
{task_prompt}

Output format (JSON only):
{
  "criteria": [
    {"criterion": "<name>", "explanation": "<why this matters>", "weight": <float>},
    ...
  ]
}`,
  insight: `You are an experienced research article evaluation expert.

Background: We are evaluating a deep research article across five dimensions: Comprehensiveness, Insight, Instruction Following, Readability, and Source Quality.

Your Goal: For the Insight dimension, create task-specific criteria.

Requirements:
1. Analyze the task and identify where deep reasoning and synthesis are needed.
2. Propose criteria focused on analytical depth, logic, originality, and practical value.
3. Provide a short explanation for each criterion.
4. Assign criterion weights that sum to exactly 1.0.
5. Avoid overlap with other dimensions.

Task:
{task_prompt}

Output format (JSON only):
{
  "criteria": [
    {"criterion": "<name>", "explanation": "<why this matters>", "weight": <float>},
    ...
  ]
}`,
  instruction_following: `You are an experienced research article evaluation expert.

Background: We are evaluating a deep research article across five dimensions: Comprehensiveness, Insight, Instruction Following, Readability, and Source Quality.

Your Goal: For the Instruction Following dimension, create task-specific criteria.

Requirements:
1. Analyze explicit task instructions, constraints, and scope boundaries.
2. Propose criteria focused on directness, completeness, relevance, and scope adherence.
3. Provide a short explanation for each criterion.
4. Assign criterion weights that sum to exactly 1.0.
5. Avoid overlap with other dimensions.

Task:
{task_prompt}

Output format (JSON only):
{
  "criteria": [
    {"criterion": "<name>", "explanation": "<why this matters>", "weight": <float>},
    ...
  ]
}`,
  readability: `You are an experienced research article evaluation expert.

Background: We are evaluating a deep research article across five dimensions: Comprehensiveness, Insight, Instruction Following, Readability, and Source Quality.

Your Goal: For the Readability dimension, create criteria that are broadly reusable yet still task-aware.

Requirements:
1. Cover structure and flow, language clarity, and information presentation quality.
2. Include criteria for formatting and audience appropriateness.
3. Provide a short explanation for each criterion.
4. Assign criterion weights that sum to exactly 1.0.
5. Avoid overlap with other dimensions.

Task:
{task_prompt}

Output format (JSON only):
{
  "criteria": [
    {"criterion": "<name>", "explanation": "<why this matters>", "weight": <float>},
    ...
  ]
}`,
  source_quality: `You are an experienced research article evaluation expert.

Background: We are evaluating a deep research article across five dimensions: Comprehensiveness, Insight, Instruction Following, Readability, and Source Quality.

Your Goal: For the Source Quality dimension, create task-specific criteria about the evidence behind the article.

Requirements:
1. Analyze the task and identify what kinds of sources, recency, and provenance it demands.
2. Propose criteria covering: citation presence and density (are claims attributed to specific sources?), source authority (primary sources, official documentation, reputable publications vs. low-quality aggregators), freshness (are cited sources and facts current enough for the task, with dates where relevant?), and traceability (can a reader verify each key claim from the citations given?).
3. Provide a short explanation for each criterion.
4. Assign criterion weights that sum to exactly 1.0.
5. Avoid overlap with other dimensions: judge the evidence and sourcing, not the prose or analysis.

Task:
{task_prompt}

Output format (JSON only):
{
  "criteria": [
    {"criterion": "<name>", "explanation": "<why this matters>", "weight": <float>},
    ...
  ]
}`,
};

const DIMENSION_WEIGHTS_PROMPT = `You are an experienced research evaluation expert.

Set evaluation weights for this task across 5 dimensions:
1. Comprehensiveness
2. Insight
3. Instruction Following
4. Readability
5. Source Quality (citation density, source authority, freshness, traceability)

The weights must be task-specific, decimal numbers, and sum to exactly 1.0.

Task:
{task_prompt}

Output format (JSON only):
{
  "comprehensiveness": <float>,
  "insight": <float>,
  "instruction_following": <float>,
  "readability": <float>,
  "source_quality": <float>
}`;

const SCORING_PROMPT = `You are a strict, meticulous, objective research article evaluator.

Today's date: {current_date}. When criteria concern freshness or recency of sources, judge
relative to this date, not your training cutoff.

Score two articles for the same task using provided criteria.

Scoring scale (0-10):
- 0-2: very poor
- 2-4: poor
- 4-6: average
- 6-8: good
- 8-10: excellent

Task:
{task_prompt}

Article 1 (Target Report):
{target_report}

Article 2 (Reference Report):
{reference_report}

Evaluation Criteria:
{criteria}

For each criterion:
1. Write one short comparative analysis.
2. Give separate article_1_score and article_2_score (0-10).

Critical instructions:
- Copy the criterion text exactly from input.
- Return JSON only.

Output format:
{
  "comprehensiveness": [
    {"criterion": "<exact criterion text>", "analysis": "<comparative analysis>", "article_1_score": <float>, "article_2_score": <float>}
  ],
  "insight": [...],
  "instruction_following": [...],
  "readability": [...],
  "source_quality": [...]
}`;

export class OpenAIJudge {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateCriteria(task: string): Promise<TaskCriteria> {
    const rawWeights = await this.retryValidatedJson<Record<DimensionName, number>>(
      DIMENSION_WEIGHTS_PROMPT.replace("{task_prompt}", task),
      (value) => validateDimensionWeights(value as Record<DimensionName, number>),
      "dimension weights generation"
    );
    const normalizedWeights = normalizeWeights(rawWeights);

    const criteriaEntries = await Promise.all(
      DIMENSIONS.map(async (dimension) => {
        const prompt = DIMENSION_PROMPTS[dimension].replace("{task_prompt}", task);
        const dimensionCriteria = await this.retryValidatedJson<{
          criteria: Array<{ criterion: string; explanation?: string; weight: number }>;
        }>(
          prompt,
          (value) => validateDimensionCriteriaResponse(value, dimension),
          `${dimension} criteria generation`
        );

        const normalizedCriteria = normalizeCriteriaWeights(
          dimensionCriteria.criteria.map((criterion) => ({
            name: sanitizeCriterionName(criterion.criterion),
            description: criterion.explanation?.trim() || "Task-specific criterion.",
            weight: criterion.weight,
          }))
        );
        return [dimension, normalizedCriteria] as const;
      })
    );

    const criteriaByDimension = Object.fromEntries(criteriaEntries) as TaskCriteria["criteria"];
    const combined = {
      dimension_weights: normalizedWeights,
      criteria: criteriaByDimension,
    } satisfies TaskCriteria;
    validateCriteria(combined);
    return combined;
  }

  async scorePair(
    task: string,
    targetReport: string,
    referenceReport: string,
    criteria: TaskCriteria
  ): Promise<RawJudgeScores> {
    const prompt = SCORING_PROMPT.replace(
      "{current_date}",
      new Date().toISOString().slice(0, 10)
    )
      .replace("{task_prompt}", task)
      .replace("{target_report}", targetReport.slice(0, MAX_REPORT_CHARS))
      .replace("{reference_report}", referenceReport.slice(0, MAX_REPORT_CHARS))
      .replace("{criteria}", formatCriteriaForPrompt(criteria));
    return this.retryValidatedJson<unknown>(
      prompt,
      (value) => validateScoringResponse(value, criteria),
      "pair scoring"
    ).then((value) => parseScoringResponse(value, criteria));
  }

  private async chatJson(prompt: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error("OpenAI returned empty response content");
    }
    return text;
  }

  private async retryValidatedJson<T>(
    prompt: string,
    validate: (value: T) => void,
    label: string
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_JUDGE_RETRIES; attempt++) {
      try {
        const content = await this.chatJson(prompt);
        const parsed = JSON.parse(content) as T;
        validate(parsed);
        return parsed;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_JUDGE_RETRIES) {
          continue;
        }
      }
    }

    throw new Error(
      `OpenAI ${label} failed after ${MAX_JUDGE_RETRIES} attempts: ${lastError?.message ?? "unknown error"}`
    );
  }
}

function formatCriteriaForPrompt(criteria: TaskCriteria): string {
  const lines: string[] = [];
  for (const dimension of DIMENSIONS) {
    const dimensionWeight = criteria.dimension_weights[dimension];
    lines.push(`### ${dimension} (weight: ${dimensionWeight.toFixed(3)})`);
    for (const criterion of criteria.criteria[dimension]) {
      lines.push(`Criterion: ${criterion.name}`);
      lines.push(`Weight: ${criterion.weight.toFixed(3)}`);
      lines.push(`Explanation: ${criterion.description}`);
    }
  }
  return lines.join("\n");
}

function validateDimensionWeights(weights: Record<DimensionName, number>) {
  for (const dimension of DIMENSIONS) {
    const value = Number(weights[dimension]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid weight for ${dimension}: ${weights[dimension]}`);
    }
  }
  assertNearOne(
    DIMENSIONS.reduce((sum, dimension) => sum + Number(weights[dimension]), 0),
    "dimension_weights"
  );
}

function validateDimensionCriteriaResponse(
  value: { criteria?: Array<{ criterion?: string; weight?: number }> },
  dimension: DimensionName
) {
  if (!Array.isArray(value.criteria)) {
    throw new Error(`${dimension} criteria response missing criteria array`);
  }
  if (value.criteria.length < 3 || value.criteria.length > 8) {
    throw new Error(`Expected 3-8 criteria for ${dimension}, got ${value.criteria.length}`);
  }
  const sum = value.criteria.reduce((total, criterion) => {
    if (!criterion.criterion || typeof criterion.criterion !== "string") {
      throw new Error(`Missing criterion text in ${dimension}`);
    }
    const weight = Number(criterion.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Invalid criterion weight in ${dimension}: ${criterion.weight}`);
    }
    return total + weight;
  }, 0);
  assertNearOne(sum, `criteria.${dimension}`);
}

function normalizeWeights(weights: Record<DimensionName, number>): TaskCriteria["dimension_weights"] {
  const total = DIMENSIONS.reduce((sum, dimension) => sum + Number(weights[dimension]), 0);
  return Object.fromEntries(
    DIMENSIONS.map((dimension) => [dimension, Number(weights[dimension]) / total])
  ) as TaskCriteria["dimension_weights"];
}

function normalizeCriteriaWeights(
  criteria: Array<{ name: string; description: string; weight: number }>
): Array<{ name: string; description: string; weight: number }> {
  const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (total <= 0) {
    throw new Error("Criteria weights total must be positive");
  }
  return criteria.map((criterion) => ({
    ...criterion,
    weight: criterion.weight / total,
  }));
}

function sanitizeCriterionName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function validateScoringResponse(value: unknown, criteria: TaskCriteria) {
  const parsed = parseScoringResponse(value, criteria);
  validateRawScores(parsed, criteria);
}

function parseScoringResponse(value: unknown, criteria: TaskCriteria): RawJudgeScores {
  if (!value || typeof value !== "object") {
    throw new Error("Scoring response is not an object");
  }
  const payload = value as Record<string, unknown>;
  const byDimension: RawJudgeScores = {};

  for (const dimension of DIMENSIONS) {
    const expectedCriteria = criteria.criteria[dimension];
    const dimensionValue = payload[dimension];
    byDimension[dimension] = parseDimensionScores(dimensionValue, expectedCriteria);
  }
  return byDimension;
}

function validateCriteria(criteria: TaskCriteria) {
  const dimWeightSum = DIMENSIONS.reduce(
    (sum, dim) => sum + criteria.dimension_weights[dim],
    0
  );
  assertNearOne(dimWeightSum, "dimension_weights");

  for (const dim of DIMENSIONS) {
    const list = criteria.criteria[dim];
    if (list.length < 3 || list.length > 8) {
      throw new Error(`Expected 3-8 criteria for ${dim}, got ${list.length}`);
    }
    const criterionWeightSum = list.reduce((sum, c) => sum + c.weight, 0);
    assertNearOne(criterionWeightSum, `criteria.${dim}`);
  }
}

function validateRawScores(scores: RawJudgeScores, criteria: TaskCriteria) {
  for (const dim of DIMENSIONS) {
    const dimScores = scores[dim];
    if (!dimScores) {
      throw new Error(`Missing score dimension ${dim}`);
    }
    for (const criterion of criteria.criteria[dim]) {
      const entry = dimScores[criterion.name];
      if (!entry) {
        throw new Error(`Missing criterion score ${dim}.${criterion.name}`);
      }
      validateScore(entry.article_1, `article_1 ${dim}.${criterion.name}`);
      validateScore(entry.article_2, `article_2 ${dim}.${criterion.name}`);
    }
  }
}

function parseDimensionScores(
  value: unknown,
  expectedCriteria: Array<{ name: string }>
): Record<string, { article_1: number; article_2: number }> {
  if (Array.isArray(value)) {
    return parseArrayDimensionScores(value, expectedCriteria);
  }
  if (value && typeof value === "object") {
    return parseObjectDimensionScores(value as Record<string, unknown>, expectedCriteria);
  }
  throw new Error("Dimension score payload must be an array or object");
}

function parseArrayDimensionScores(
  rows: unknown[],
  expectedCriteria: Array<{ name: string }>
): Record<string, { article_1: number; article_2: number }> {
  const byNormalized = new Map<string, { article_1: number; article_2: number }>();

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const entry = row as Record<string, unknown>;
    const criterion =
      typeof entry["criterion"] === "string" ? sanitizeCriterionName(entry["criterion"]) : "";
    const article1 = Number(entry["article_1_score"]);
    const article2 = Number(entry["article_2_score"]);
    if (!criterion || !Number.isFinite(article1) || !Number.isFinite(article2)) {
      continue;
    }
    byNormalized.set(normalizeKey(criterion), {
      article_1: article1,
      article_2: article2,
    });
  }

  const byCriterion: Record<string, { article_1: number; article_2: number }> = {};
  for (const criterion of expectedCriteria) {
    const match = byNormalized.get(normalizeKey(criterion.name));
    if (!match) {
      throw new Error(`Missing criterion score for "${criterion.name}"`);
    }
    byCriterion[criterion.name] = match;
  }
  return byCriterion;
}

function parseObjectDimensionScores(
  value: Record<string, unknown>,
  expectedCriteria: Array<{ name: string }>
): Record<string, { article_1: number; article_2: number }> {
  const byNormalized = new Map<string, { article_1: number; article_2: number }>();
  for (const [rawCriterion, scoreValue] of Object.entries(value)) {
    if (!scoreValue || typeof scoreValue !== "object") {
      continue;
    }
    const score = scoreValue as Record<string, unknown>;
    const article1 = Number(score["article_1"]);
    const article2 = Number(score["article_2"]);
    if (!Number.isFinite(article1) || !Number.isFinite(article2)) {
      continue;
    }
    byNormalized.set(normalizeKey(rawCriterion), {
      article_1: article1,
      article_2: article2,
    });
  }

  const byCriterion: Record<string, { article_1: number; article_2: number }> = {};
  for (const criterion of expectedCriteria) {
    const match = byNormalized.get(normalizeKey(criterion.name));
    if (!match) {
      throw new Error(`Missing criterion score for "${criterion.name}"`);
    }
    byCriterion[criterion.name] = match;
  }
  return byCriterion;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function validateScore(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`Invalid score for ${label}: ${value}`);
  }
}

function assertNearOne(value: number, label: string) {
  if (Math.abs(value - 1) > 0.02) {
    throw new Error(`${label} must sum to 1.0, got ${value}`);
  }
}
