import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { dbErrorToMCPError } from "@app/lib/api/actions/servers/pod_databases/tools/shared";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { generateSchemaOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import type { FunctionManifests } from "@app/lib/api/sandbox_functions/manifests";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { Err, Ok } from "@app/types/shared/result";

// SQLite stores no column modes; they live in the published functions' manifests. Collects
// `table.column -> mode (declared by ...)` lines, surfacing disagreements between functions.
export function formatManifestModes(
  database: string,
  functions: { slug: string; manifests: FunctionManifests | null }[]
): string {
  // column key -> mode -> slugs
  const modes = new Map<string, Map<string, string[]>>();
  for (const fn of functions) {
    const dbManifest = fn.manifests?.databases[database];
    if (dbManifest === undefined) {
      continue;
    }
    for (const [tableName, tableManifest] of Object.entries(
      dbManifest.tables
    )) {
      for (const [columnName, column] of Object.entries(
        tableManifest.columns
      )) {
        if (column.mode === null) {
          continue;
        }
        const key = `${tableName}.${columnName}`;
        const byMode = modes.get(key) ?? new Map<string, string[]>();
        const slugs = byMode.get(column.mode) ?? [];
        slugs.push(fn.slug);
        byMode.set(column.mode, slugs);
        modes.set(key, byMode);
      }
    }
  }

  if (modes.size === 0) {
    return "No column modes declared by the published functions for this database.";
  }

  const lines = [...modes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, byMode]) => {
      const parts = [...byMode.entries()].map(
        ([mode, slugs]) =>
          `mode=${mode} (declared by ${[...new Set(slugs)].sort().join(", ")})`
      );
      const disagreement =
        byMode.size > 1 ? " — DISAGREEMENT: align the shared schema file" : "";
      return `- ${key}: ${parts.join("; ")}${disagreement}`;
    });

  return `Column modes from the published functions' manifests (re-add them to the schema file):\n${lines.join("\n")}`;
}

export async function getSchemaHandler(
  { database }: { database: string },
  { auth, toolContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, { toolContext });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }
  const pod = podResult.value.pod;

  const schemaResult = await generateSchemaOnSandbox(auth, {
    space: pod,
    database,
  });
  if (schemaResult.isErr()) {
    return new Err(dbErrorToMCPError(schemaResult.error));
  }

  const functions = await SandboxFunctionResource.listBySpace(auth, pod);

  return new Ok([
    {
      type: "text",
      text: `Regenerated drizzle schema for "${database}" (from the live database):\n\n${schemaResult.value}`,
    },
    { type: "text", text: formatManifestModes(database, functions) },
  ]);
}
