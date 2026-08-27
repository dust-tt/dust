import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";

import { DEFAULT_ES_URL, DEFAULT_INDEX, esRequest } from "./es.ts";
import type { MatchMode, NameFallback } from "./query.ts";
import {
  buildAgentSearchQuery,
  contextFromProfile,
  fetchReferencedSpaces,
} from "./query.ts";
import { contentTerms, documentTerms } from "./text.ts";
import type {
  EvalMetrics,
  NegativeMetrics,
  EvalQuery,
  EvalQuerySet,
  EvalReport,
  UserProfile,
} from "./types.ts";

const BATCH_SIZE = 100;
const CUTOFF = 10;

const { values } = parseArgs({
  options: {
    queries: { type: "string", default: "assets/eval_queries_dust.json" },
    profile: { type: "string" },
    spaces: { type: "string", default: "" },
    groups: { type: "string", default: "" },
    "exclude-global": { type: "boolean", default: false },
    "with-instructions": { type: "boolean", default: false },
    "min-should-match": { type: "string", default: "" },
    "match-mode": { type: "string", default: "hybrid" },
    "name-fallback": { type: "string", default: "fuzzy" },
    "group-boost": { type: "string", default: "0.5" },
    "max-queries": { type: "string", default: "0" },
    save: { type: "string" },
    compare: { type: "string" },
    misses: { type: "string", default: "0" },
    es: { type: "string", default: DEFAULT_ES_URL },
    index: { type: "string", default: DEFAULT_INDEX },
  },
});

const querySet: EvalQuerySet = JSON.parse(
  await readFile(resolve(values.queries), "utf-8")
);
const profile: UserProfile | null = values.profile
  ? JSON.parse(await readFile(resolve(values.profile), "utf-8"))
  : null;

const context = contextFromProfile(profile, {
  spaces: values.spaces,
  groups: values.groups,
});
const groupBoost = Number(values["group-boost"]);
const excludeGlobal = values["exclude-global"];
const includeInstructions = values["with-instructions"];
const minShouldMatch = values["min-should-match"];
const matchMode = values["match-mode"] as MatchMode;
const nameFallback = values["name-fallback"] as NameFallback;
const referencedSpaces = await fetchReferencedSpaces(values.es, values.index);
const maxQueries = Number(values["max-queries"]);
const queries =
  maxQueries > 0 ? querySet.queries.slice(0, maxQueries) : querySet.queries;

interface Hit {
  _id: string;
  _source: { name: string; description: string };
}

interface MsearchResponse {
  responses: {
    hits?: { total: { value: number }; hits: Hit[] };
    error?: { reason?: string };
  }[];
}

interface QueryOutcome {
  rank: number | null;
  totalHits: number;
  coverage: number[];
}

const errors: { query: string; reason: string }[] = [];

function rankOf(hits: Hit[], targetId: string): number | null {
  const index = hits.findIndex((hit) => hit._id === targetId);
  return index === -1 ? null : index + 1;
}

// Precision proxy: with only one labelled document per query there is nothing to score the
// other results against, so measure how much of what was asked for each non-target result
// actually contains.
function coverageOfNonTargets(
  hits: Hit[],
  query: string,
  targetId: string | null
): number[] {
  const queryTerms = [...contentTerms(query)];
  if (queryTerms.length === 0) {
    return [];
  }
  return hits
    .filter((hit) => hit._id !== targetId)
    .map((hit) => {
      const terms = documentTerms(hit._source.name, hit._source.description);
      return (
        queryTerms.filter((term) => terms.has(term)).length / queryTerms.length
      );
    });
}

async function runBatch(
  batch: { query: string; targetId: string | null }[]
): Promise<QueryOutcome[]> {
  const lines: string[] = [];
  for (const query of batch) {
    lines.push(JSON.stringify({ index: values.index }));
    lines.push(
      JSON.stringify({
        query: buildAgentSearchQuery({
          ...context,
          searchTerm: query.query,
          excludeGlobal,
          includeInstructions,
          minShouldMatch,
          matchMode,
          nameFallback,
          groupBoost,
          referencedSpaces,
        }),
        size: CUTOFF,
        _source: ["name", "description"],
        track_total_hits: true,
        sort: [{ _score: "desc" }, { "name.keyword": "asc" }],
      })
    );
  }
  const result = await esRequest<MsearchResponse>(
    values.es,
    "POST",
    "/_msearch",
    `${lines.join("\n")}\n`,
    "application/x-ndjson"
  );
  return result.responses.map((response, index) => {
    const { query, targetId } = batch[index];
    if (!response.hits) {
      errors.push({ query, reason: response.error?.reason ?? "unknown" });
      return { rank: null, totalHits: 0, coverage: [] };
    }
    return {
      rank: targetId ? rankOf(response.hits.hits, targetId) : null,
      totalHits: response.hits.total.value,
      coverage: coverageOfNonTargets(response.hits.hits, query, targetId),
    };
  });
}

async function runAll(
  items: { query: string; targetId: string | null }[],
  label: string
): Promise<QueryOutcome[]> {
  const outcomes: QueryOutcome[] = [];
  for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
    outcomes.push(...(await runBatch(items.slice(offset, offset + BATCH_SIZE))));
    process.stdout.write(
      `\r${label} ${Math.min(offset + BATCH_SIZE, items.length)}/${items.length}`
    );
  }
  process.stdout.write("\r\x1b[K");
  return outcomes;
}

const outcomes = await runAll(queries, "scored");
const ranks = outcomes.map((outcome) => outcome.rank);
const negatives = querySet.negatives ?? [];
const negativeOutcomes = await runAll(
  negatives.map((negative) => ({ query: negative.query, targetId: null })),
  "negatives"
);

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function metricsFor(indices: number[]): EvalMetrics {
  const coverage = indices.flatMap((index) => outcomes[index].coverage);
  const hit = (cutoff: number) =>
    indices.filter((index) => {
      const rank = ranks[index];
      return rank !== null && rank <= cutoff;
    }).length / indices.length;
  return {
    queries: indices.length,
    mrr:
      indices.reduce((sum, index) => {
        const rank = ranks[index];
        return sum + (rank === null ? 0 : 1 / rank);
      }, 0) / indices.length,
    recallAt1: hit(1),
    recallAt5: hit(5),
    recallAt10: hit(10),
    hits: mean(indices.map((index) => outcomes[index].totalHits)),
    coverage: mean(coverage),
    junk: coverage.length === 0 ? 0 : mean(coverage.map((value) => (value === 0 ? 1 : 0))),
    junkHits: mean(
      indices.map(
        (index) => outcomes[index].coverage.filter((value) => value === 0).length
      )
    ),
  };
}

const indicesByKind = new Map<string, number[]>();
for (const [index, query] of queries.entries()) {
  const existing = indicesByKind.get(query.kind) ?? [];
  existing.push(index);
  indicesByKind.set(query.kind, existing);
}

const negativeIndicesByKind = new Map<string, number[]>();
for (const [index, negative] of negatives.entries()) {
  const existing = negativeIndicesByKind.get(negative.kind) ?? [];
  existing.push(index);
  negativeIndicesByKind.set(negative.kind, existing);
}

function negativeMetricsFor(indices: number[]): NegativeMetrics {
  return {
    queries: indices.length,
    meanHits: mean(indices.map((index) => negativeOutcomes[index].totalHits)),
    zeroHitRate: mean(
      indices.map((index) => (negativeOutcomes[index].totalHits === 0 ? 1 : 0))
    ),
  };
}

const report: EvalReport = {
  ranAt: new Date().toISOString(),
  querySet: basename(values.queries),
  groupBoost,
  excludeGlobal,
  includeInstructions,
  minShouldMatch,
  matchMode,
  nameFallback,
  overall: metricsFor(queries.map((_, index) => index)),
  byKind: Object.fromEntries(
    [...indicesByKind]
      .sort()
      .map(([kind, indices]) => [kind, metricsFor(indices)])
  ),
  negatives: Object.fromEntries(
    [...negativeIndicesByKind]
      .sort()
      .map(([kind, indices]) => [kind, negativeMetricsFor(indices)])
  ),
};

const baseline: EvalReport | null = values.compare
  ? JSON.parse(await readFile(resolve(values.compare), "utf-8"))
  : null;

function formatRow(label: string, metrics: EvalMetrics, previous?: EvalMetrics) {
  const cell = (value: number, before?: number) => {
    const rendered = value.toFixed(3).padStart(6);
    if (before === undefined) {
      return rendered;
    }
    const delta = value - before;
    const sign = delta >= 0 ? "+" : "";
    return `${rendered} (${sign}${delta.toFixed(3)})`.padStart(20);
  };
  console.log(
    [
      label.padEnd(13),
      String(metrics.queries).padStart(5),
      cell(metrics.mrr, previous?.mrr),
      cell(metrics.recallAt1, previous?.recallAt1),
      cell(metrics.recallAt5, previous?.recallAt5),
      cell(metrics.recallAt10, previous?.recallAt10),
    ].join("  ")
  );
}

console.log(
  `${querySet.candidateCount} candidates, ${queries.length} queries, `
    + `group-boost=${groupBoost}${excludeGlobal ? ", no globals" : ""}`
    + `${includeInstructions ? ", +instructions" : ""}`
    + `${minShouldMatch ? `, msm=${minShouldMatch}` : ""}`
    + `, ${matchMode}, name-fallback=${nameFallback}`
    + `${baseline ? ` — vs ${basename(values.compare!)}` : ""}\n`
);
const header = baseline
  ? "kind             n     MRR@10                 R@1                   R@5                  R@10"
  : "kind             n     MRR@10     R@1     R@5    R@10";
console.log(header);
for (const [kind, metrics] of Object.entries(report.byKind)) {
  formatRow(kind, metrics, baseline?.byKind[kind]);
}
formatRow("OVERALL", report.overall, baseline?.overall);

function formatPrecisionRow(
  label: string,
  metrics: EvalMetrics,
  previous?: EvalMetrics
) {
  const cell = (value: number, before: number | undefined, digits = 3) => {
    const rendered = value.toFixed(digits).padStart(7);
    if (before === undefined) {
      return rendered;
    }
    const delta = value - before;
    return `${rendered} (${delta >= 0 ? "+" : ""}${delta.toFixed(digits)})`.padStart(20);
  };
  console.log(
    [
      label.padEnd(13),
      cell(metrics.hits, previous?.hits, 1),
      cell(metrics.coverage, previous?.coverage),
      cell(metrics.junk, previous?.junk),
      cell(metrics.junkHits, previous?.junkHits, 2),
    ].join("  ")
  );
}

console.log(
  `\nprecision (non-target results in the top ${CUTOFF})\n`
    + `kind             hits  coverage     junk  junk/query`
);
for (const [kind, metrics] of Object.entries(report.byKind)) {
  formatPrecisionRow(kind, metrics, baseline?.byKind[kind]);
}
formatPrecisionRow("OVERALL", report.overall, baseline?.overall);

if (negatives.length > 0) {
  console.log(`\nnegative queries (should return nothing)\nkind             n   meanHits  zeroHit`);
  for (const [kind, metrics] of Object.entries(report.negatives)) {
    const previous = baseline?.negatives?.[kind];
    const cell = (value: number, before: number | undefined, digits = 2) => {
      const rendered = value.toFixed(digits).padStart(8);
      if (before === undefined) {
        return rendered;
      }
      const delta = value - before;
      return `${rendered} (${delta >= 0 ? "+" : ""}${delta.toFixed(digits)})`.padStart(20);
    };
    console.log(
      [
        kind.padEnd(13),
        String(metrics.queries).padStart(4),
        cell(metrics.meanHits, previous?.meanHits, 1),
        cell(metrics.zeroHitRate, previous?.zeroHitRate),
      ].join("  ")
    );
  }
}

const missCount = Number(values.misses);
if (missCount > 0) {
  console.log(`\nworst misses (target outside top ${CUTOFF}):`);
  const missed = queries
    .map((query, index) => ({ query, rank: ranks[index] }))
    .filter((entry) => entry.rank === null)
    .slice(0, missCount);
  for (const entry of missed) {
    console.log(
      `  ${entry.query.kind.padEnd(13)} "${entry.query.query.slice(0, 46).padEnd(46)}" -> ${entry.query.targetName}`
    );
  }
}

if (values.save) {
  await writeFile(
    resolve(values.save),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(`\nsaved ${values.save}`);
}
