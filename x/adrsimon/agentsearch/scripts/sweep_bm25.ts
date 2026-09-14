import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { parseArgs } from "node:util";
import { promisify } from "node:util";

import { DEFAULT_ES_URL, DEFAULT_INDEX, esRequest } from "./es.ts";
import type { EvalReport } from "./types.ts";

const run = promisify(execFile);
const REPORT_PATH = "/tmp/agentsearch_sweep_report.json";

const { values } = parseArgs({
  options: {
    similarity: { type: "string", default: "name_bm25" },
    param: { type: "string", default: "b" },
    values: { type: "string", default: "0,0.25,0.5,0.75,1" },
    queries: { type: "string", default: "assets/eval_queries_dust.json" },
    profile: { type: "string" },
    "exclude-global": { type: "boolean", default: false },
    "eval-args": { type: "string", default: "" },
    es: { type: "string", default: DEFAULT_ES_URL },
    index: { type: "string", default: DEFAULT_INDEX },
  },
});

interface SettingsResponse {
  [index: string]: {
    settings: {
      index: { similarity: Record<string, { k1: string; b: string }> };
    };
  };
}

async function currentSimilarity() {
  const settings = await esRequest<SettingsResponse>(
    values.es,
    "GET",
    `/${values.index}/_settings`
  );
  return settings[values.index].settings.index.similarity;
}

async function setParam(value: number) {
  const current = await currentSimilarity();
  const target = current[values.similarity];
  await esRequest(values.es, "POST", `/${values.index}/_close`);
  await esRequest(
    values.es,
    "PUT",
    `/${values.index}/_settings`,
    JSON.stringify({
      index: {
        similarity: {
          [values.similarity]: {
            type: "BM25",
            k1: Number(target.k1),
            b: Number(target.b),
            [values.param]: value,
          },
        },
      },
    })
  );
  await esRequest(values.es, "POST", `/${values.index}/_open`);
  await esRequest(
    values.es,
    "GET",
    "/_cluster/health?wait_for_status=green&timeout=30s"
  );
}

async function runEval(): Promise<EvalReport> {
  await rm(REPORT_PATH, { force: true });
  await run("npx", [
    "tsx",
    "scripts/eval.ts",
    "--queries",
    values.queries,
    ...(values.profile ? ["--profile", values.profile] : []),
    ...(values["exclude-global"] ? ["--exclude-global"] : []),
    ...values["eval-args"].split(" ").filter(Boolean),
    "--save",
    REPORT_PATH,
  ]);
  return JSON.parse(await readFile(REPORT_PATH, "utf-8"));
}

const before = await currentSimilarity();
console.log(
  `sweeping ${values.similarity}.${values.param} over [${values.values}]`
    + ` (starting: ${JSON.stringify(before[values.similarity])})\n`
);
console.log(`${values.param.padEnd(6)}  MRR@10     R@1    hits  coverage  junk/query`);

for (const raw of values.values.split(",")) {
  const value = Number(raw);
  await setParam(value);
  const report = await runEval();
  const { overall } = report;
  console.log(
    [
      raw.padEnd(6),
      overall.mrr.toFixed(4).padStart(6),
      overall.recallAt1.toFixed(3).padStart(6),
      overall.hits.toFixed(1).padStart(6),
      overall.coverage.toFixed(3).padStart(8),
      overall.junkHits.toFixed(2).padStart(10),
    ].join("  ")
  );
}

await setParam(Number(before[values.similarity][values.param as "k1" | "b"]));
console.log(`\nrestored ${values.similarity}.${values.param}`);
