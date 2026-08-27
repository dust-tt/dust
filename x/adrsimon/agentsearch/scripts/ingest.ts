import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { DEFAULT_ES_URL, DEFAULT_INDEX, esRequest } from "./es.ts";
import { toAgentSearchDocument } from "./documents.ts";
import type {
  WorkspaceAgentExport,
} from "./types.ts";

const PROJECT_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const BATCH_SIZE = 200;

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    es: { type: "string", default: DEFAULT_ES_URL },
    index: { type: "string", default: DEFAULT_INDEX },
  },
});

interface BulkResponse {
  errors: boolean;
  items: { index: { error?: unknown } }[];
}

const exportPath = values.file
  ? resolve(values.file)
  : join(PROJECT_ROOT, "assets", "agents_0ec9852c2f.json");

const workspaceExport: WorkspaceAgentExport = JSON.parse(
  await readFile(exportPath, "utf-8")
);

if (workspaceExport.agents.length === 0) {
  throw new Error(
    `${exportPath} holds no agents. Run scripts/export_workspace_agents.ts first (see README).`
  );
}

console.log(
  `loaded ${workspaceExport.agents.length} agents from ${workspaceExport.workspaceName} (${workspaceExport.workspaceId}), generated ${workspaceExport.generatedAt}`
);

await esRequest(values.es, "DELETE", `/${values.index}`).catch(() => {});
await esRequest(
  values.es,
  "PUT",
  `/${values.index}`,
  await readFile(join(PROJECT_ROOT, "index", "agent_search.mappings.json"), "utf-8")
);

for (let i = 0; i < workspaceExport.agents.length; i += BATCH_SIZE) {
  const batch = workspaceExport.agents.slice(i, i + BATCH_SIZE);
  const lines = batch.flatMap((agent) => [
    JSON.stringify({ index: { _index: values.index, _id: agent.sId } }),
    JSON.stringify(toAgentSearchDocument(agent)),
  ]);
  const result = await esRequest<BulkResponse>(
    values.es,
    "POST",
    "/_bulk",
    `${lines.join("\n")}\n`,
    "application/x-ndjson"
  );
  if (result.errors) {
    const failed = result.items.find((item) => item.index.error);
    throw new Error(`bulk error: ${JSON.stringify(failed?.index.error)}`);
  }
  const done = Math.min(i + BATCH_SIZE, workspaceExport.agents.length);
  process.stdout.write(`\rindexed ${done}/${workspaceExport.agents.length}`);
}

await esRequest(values.es, "POST", `/${values.index}/_refresh`);
const { count } = await esRequest<{ count: number }>(
  values.es,
  "GET",
  `/${values.index}/_count`
);
console.log(`\ndone: ${count} documents in ${values.index}`);
