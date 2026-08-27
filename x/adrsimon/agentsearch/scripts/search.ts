import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { DEFAULT_ES_URL, DEFAULT_INDEX, esRequest } from "./es.ts";
import type { MatchMode, NameFallback } from "./query.ts";
import {
  buildAgentSearchQuery,
  contextFromProfile,
  fetchReferencedSpaces,
} from "./query.ts";
import type { AgentSearchDocument, UserProfile } from "./types.ts";

const { values } = parseArgs({
  options: {
    q: { type: "string", default: "" },
    profile: { type: "string" },
    spaces: { type: "string", default: "" },
    groups: { type: "string", default: "" },
    "exclude-global": { type: "boolean", default: false },
    "with-instructions": { type: "boolean", default: false },
    "min-should-match": { type: "string", default: "" },
    "match-mode": { type: "string", default: "hybrid" },
    "name-fallback": { type: "string", default: "fuzzy" },
    limit: { type: "string", default: "10" },
    "group-boost": { type: "string", default: "0.5" },
    explain: { type: "boolean", default: false },
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
const searchTerm = values.q.trim();
const limit = Number(values.limit);
const referencedSpaces = await fetchReferencedSpaces(values.es, values.index);

interface SearchResponse {
  hits: {
    total: { value: number };
    hits: {
      _id: string;
      _score: number;
      _source: Pick<
        AgentSearchDocument,
        "name" | "description" | "scope" | "usage"
      >;
    }[];
  };
}

const query = buildAgentSearchQuery({
  ...context,
  searchTerm,
  excludeGlobal: values["exclude-global"],
  includeInstructions: values["with-instructions"],
  minShouldMatch: values["min-should-match"],
  matchMode: values["match-mode"] as MatchMode,
  nameFallback: values["name-fallback"] as NameFallback,
  groupBoost: Number(values["group-boost"]),
  referencedSpaces,
});

const result = await esRequest<SearchResponse>(
  values.es,
  "POST",
  `/${values.index}/_search`,
  JSON.stringify({
    query,
    size: limit,
    _source: ["name", "description", "scope", "usage.messages"],
    sort: [{ _score: "desc" }, { "name.keyword": "asc" }],
  })
);

const asWhom = profile
  ? `as ${profile.user.email} (${profile.role})`
  : "as an anonymous caller";
console.log(
  `q="${searchTerm}" ${asWhom}`
    + ` spaces=${context.readableNonPodSpaceIds.length}+${context.readablePodSpaceIds.length} pods`
    + ` groups=${context.userGroupIds.length} -> ${result.hits.total.value} hits\n`
);
for (const [rank, hit] of result.hits.hits.entries()) {
  const source = hit._source;
  console.log(
    [
      String(rank + 1).padStart(2),
      source.name.slice(0, 34).padEnd(34),
      hit._score.toFixed(2).padStart(8),
      `${String(source.usage.messages).padStart(6)} msg`,
      source.scope.padEnd(7),
      source.description.slice(0, 58).replace(/\n/g, " "),
    ].join("  ")
  );
}

if (values.explain && result.hits.hits.length > 0) {
  const top = result.hits.hits[0];
  const explanation = await esRequest<{ explanation: unknown }>(
    values.es,
    "POST",
    `/${values.index}/_explain/${top._id}`,
    JSON.stringify({ query })
  );
  console.log(`\nexplain for "${top._source.name}":`);
  console.log(JSON.stringify(explanation.explanation, null, 2).slice(0, 3000));
}
