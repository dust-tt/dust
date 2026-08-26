import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";

import { DEFAULT_ES_URL, DEFAULT_INDEX, esRequest } from "./es.ts";
import { buildFilters, contextFromProfile } from "./query.ts";
import { splitName, tokenize } from "./text.ts";
import type {
  EvalNegative,
  EvalQuery,
  EvalQuerySet,
  QueryKind,
  UserProfile,
} from "./types.ts";

const PAGE_SIZE = 1000;
const MIN_TERM_LENGTH = 3;
const NAME_PREFIX_RATIO = 0.6;
const MIN_NAME_PREFIX = 4;
const DESC_TERM_COUNT = 3;
const DESC_PHRASE_LENGTH = 4;
const CHIMERA_COUNT = 120;
const CHIMERA_TERMS_PER_SOURCE = 2;

const OOV_WORDBANK =
  ("aardvark accordion avalanche bassoon bicycle blizzard cathedral cinnamon compass "
   + "coriander dandelion driftwood eyebrow flamingo glacier granite harmonica hedgehog "
   + "igloo jellyfish kayak lagoon lantern marmalade meteorite molasses narwhal obsidian "
   + "octopus paprika parchment pelican quartz raccoon rhubarb saffron seashell sequoia "
   + "sledgehammer stalactite tambourine tangerine thimble tornado trombone tulip "
   + "umbrella vanilla volcano walrus wheelbarrow windmill xylophone yacht zeppelin").split(" ");

const { values } = parseArgs({
  options: {
    profile: { type: "string" },
    spaces: { type: "string", default: "" },
    groups: { type: "string", default: "" },
    "exclude-global": { type: "boolean", default: false },
    out: { type: "string" },
    es: { type: "string", default: DEFAULT_ES_URL },
    index: { type: "string", default: DEFAULT_INDEX },
  },
});

const profile: UserProfile | null = values.profile
  ? JSON.parse(await readFile(resolve(values.profile), "utf-8"))
  : null;

const context = contextFromProfile(profile, {
  spaces: values.spaces,
  groups: values.groups,
});

interface Candidate {
  agentId: string;
  name: string;
  description: string;
}

interface PageResponse {
  hits: {
    hits: {
      _id: string;
      sort: unknown[];
      _source: { name: string; description: string };
    }[];
  };
}

async function fetchCandidates(): Promise<Candidate[]> {
  const query = {
    bool: {
      filter: buildFilters({
        ...context,
        searchTerm: "",
        scopes: [],
        excludeGlobal: values["exclude-global"],
        includeInstructions: false,
        minShouldMatch: "",
        matchMode: "bool_prefix",
        nameFallback: "off",
        groupBoost: 0,
      }),
    },
  };

  const candidates: Candidate[] = [];
  let searchAfter: unknown[] | undefined;
  for (;;) {
    const page = await esRequest<PageResponse>(
      values.es,
      "POST",
      `/${values.index}/_search`,
      JSON.stringify({
        query,
        size: PAGE_SIZE,
        _source: ["name", "description"],
        sort: [{ _doc: "asc" }],
        ...(searchAfter ? { search_after: searchAfter } : {}),
      })
    );
    if (page.hits.hits.length === 0) {
      return candidates;
    }
    for (const hit of page.hits.hits) {
      candidates.push({
        agentId: hit._id,
        name: hit._source.name,
        description: hit._source.description ?? "",
      });
    }
    searchAfter = page.hits.hits[page.hits.hits.length - 1].sort;
  }
}

function buildIdf(candidates: Candidate[]): Map<string, number> {
  const documentFrequency = new Map<string, number>();
  for (const candidate of candidates) {
    for (const token of new Set(tokenize(candidate.description))) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [token, frequency] of documentFrequency) {
    idf.set(token, Math.log(candidates.length / frequency));
  }
  return idf;
}

function descriptionQueries(
  candidate: Candidate,
  idf: Map<string, number>
): { kind: QueryKind; query: string }[] {
  const tokens = tokenize(candidate.description);
  if (tokens.length < DESC_TERM_COUNT) {
    return [];
  }

  const ranked = [...new Set(tokens)].sort(
    (a, b) => (idf.get(b) ?? 0) - (idf.get(a) ?? 0)
  );
  const salientTerms = ranked.slice(0, DESC_TERM_COUNT);

  const anchor = tokens.indexOf(ranked[0]);
  const start = Math.max(0, anchor - 1);
  const phrase = tokens.slice(start, start + DESC_PHRASE_LENGTH);

  return [
    { kind: "desc_terms", query: salientTerms.join(" ") },
    { kind: "desc_phrase", query: phrase.join(" ") },
  ];
}

function deleteMiddleCharacter(name: string): string {
  const at = Math.floor(name.length / 2);
  return name.slice(0, at) + name.slice(at + 1);
}

function transposeMiddleCharacters(name: string): string {
  const at = Math.floor(name.length / 2);
  return (
    name.slice(0, at) + name[at + 1] + name[at] + name.slice(at + 2)
  );
}

function typoQueries(name: string): { kind: QueryKind; query: string }[] {
  if (name.length < MIN_NAME_PREFIX + 2) {
    return [];
  }
  return [
    { kind: "name_typo", query: deleteMiddleCharacter(name).toLowerCase() },
    {
      kind: "name_transpose",
      query: transposeMiddleCharacters(name).toLowerCase(),
    },
  ];
}

function queriesFor(
  candidate: Candidate,
  idf: Map<string, number>
): { kind: QueryKind; query: string }[] {
  const prefixLength = Math.max(
    MIN_NAME_PREFIX,
    Math.ceil(candidate.name.length * NAME_PREFIX_RATIO)
  );
  return [
    { kind: "name_exact", query: candidate.name.toLowerCase() },
    { kind: "name_words", query: splitName(candidate.name) },
    {
      kind: "name_prefix",
      query: candidate.name.slice(0, prefixLength).toLowerCase(),
    },
    ...typoQueries(candidate.name),
    ...descriptionQueries(candidate, idf),
  ];
}

interface CountResponse {
  responses: { hits: { total: { value: number } } }[];
}

async function absentFromCorpus(words: string[]): Promise<string[]> {
  const lines: string[] = [];
  for (const word of words) {
    lines.push(JSON.stringify({ index: values.index }));
    lines.push(
      JSON.stringify({
        query: { multi_match: { query: word, fields: ["name", "description"] } },
        size: 0,
        track_total_hits: true,
      })
    );
  }
  const result = await esRequest<CountResponse>(
    values.es,
    "POST",
    "/_msearch",
    `${lines.join("\n")}\n`,
    "application/x-ndjson"
  );
  return words.filter(
    (_, index) => result.responses[index].hits.total.value === 0
  );
}

function buildNegatives(
  candidates: Candidate[],
  idf: Map<string, number>,
  oovWords: string[]
): EvalNegative[] {
  const negatives: EvalNegative[] = [];

  for (const [index, word] of oovWords.entries()) {
    negatives.push({
      query: word,
      kind: "oov",
      sources: [],
    });
    const partner = oovWords[(index + 1) % oovWords.length];
    if (partner !== word) {
      negatives.push({ query: `${word} ${partner}`, kind: "oov", sources: [] });
    }
  }

  const salient = (candidate: Candidate) =>
    [...new Set(tokenize(candidate.description))]
      .sort((a, b) => (idf.get(b) ?? 0) - (idf.get(a) ?? 0))
      .slice(0, CHIMERA_TERMS_PER_SOURCE);

  const usable = candidates.filter(
    (candidate) => salient(candidate).length === CHIMERA_TERMS_PER_SOURCE
  );
  const stride = Math.floor(usable.length / 2);
  for (let index = 0; index < Math.min(CHIMERA_COUNT, stride); index++) {
    const left = usable[index];
    const right = usable[index + stride];
    const terms = [...salient(left), ...salient(right)];
    if (new Set(terms).size !== terms.length) {
      continue;
    }
    negatives.push({
      query: terms.join(" "),
      kind: "chimera",
      sources: [left.agentId, right.agentId],
    });
  }

  return negatives;
}

const candidates = await fetchCandidates();
const idf = buildIdf(candidates);

const byQuery = new Map<string, EvalQuery[]>();
for (const candidate of candidates) {
  for (const { kind, query } of queriesFor(candidate, idf)) {
    const trimmed = query.trim();
    if (trimmed.length < MIN_TERM_LENGTH) {
      continue;
    }
    const existing = byQuery.get(trimmed) ?? [];
    existing.push({
      query: trimmed,
      kind,
      targetId: candidate.agentId,
      targetName: candidate.name,
    });
    byQuery.set(trimmed, existing);
  }
}

const queries: EvalQuery[] = [];
let ambiguousDropped = 0;
for (const entries of byQuery.values()) {
  const targets = new Set(entries.map((entry) => entry.targetId));
  if (targets.size > 1) {
    ambiguousDropped += entries.length;
    continue;
  }
  queries.push(entries[0]);
}

const oovWords = await absentFromCorpus(OOV_WORDBANK);
const negatives = buildNegatives(candidates, idf, oovWords);

const querySet: EvalQuerySet = {
  generatedAt: new Date().toISOString(),
  index: values.index,
  profile: values.profile ? basename(values.profile) : null,
  excludeGlobal: values["exclude-global"],
  candidateCount: candidates.length,
  queries,
  negatives,
};

const outputPath = resolve(
  values.out ?? `assets/eval_queries_${values.index}.json`
);
await writeFile(outputPath, `${JSON.stringify(querySet, null, 2)}\n`);

const byKind = new Map<string, number>();
for (const query of queries) {
  byKind.set(query.kind, (byKind.get(query.kind) ?? 0) + 1);
}
console.log(
  `${candidates.length} candidates -> ${queries.length} queries `
    + `(${ambiguousDropped} dropped as ambiguous)`
);
for (const [kind, count] of [...byKind].sort()) {
  console.log(`  ${kind.padEnd(13)} ${String(count).padStart(5)}`);
}
console.log(
  `  ${"negatives".padEnd(13)} ${String(negatives.length).padStart(5)} `
    + `(${oovWords.length}/${OOV_WORDBANK.length} wordbank terms absent from corpus)`
);
console.log(`wrote ${outputPath}`);
