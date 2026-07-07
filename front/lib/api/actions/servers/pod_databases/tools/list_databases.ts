import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  dbErrorToMCPError,
  declaringFunctionsByDatabase,
} from "@app/lib/api/actions/servers/pod_databases/tools/shared";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import type { LiveDatabaseEntry } from "@app/lib/api/sandbox_functions/dsbx_db";
import { listDatabasesOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { Err, Ok } from "@app/types/shared/result";

export function formatDatabasesList(
  live: LiveDatabaseEntry[],
  declaredBy: Map<string, string[]>
): string {
  const liveNames = new Set(live.map((db) => db.name));
  const declaredOnly = [...declaredBy.keys()]
    .filter((name) => !liveNames.has(name))
    .sort();

  if (live.length === 0 && declaredOnly.length === 0) {
    return "This pod has no databases yet. A database is created the first time a function declaring it is published.";
  }

  const lines = live.map((db) => {
    const slugs = declaredBy.get(db.name);
    const declaration = slugs
      ? `declared by: ${slugs.join(", ")}`
      : "UNTRACKED: no published function declares it anymore";
    return `- ${db.name} (${formatSize(db.sizeBytes)}) — ${declaration}`;
  });
  for (const name of declaredOnly) {
    lines.push(
      `- ${name} — declared by ${declaredBy.get(name)?.join(", ") ?? ""} but no live database file exists yet`
    );
  }

  return (
    `Pod databases:\n${lines.join("\n")}\n\n` +
    "Use get_schema for a database's structure and query for read-only SQL."
  );
}

function formatSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${sizeBytes} B`;
}

export async function listDatabasesHandler(
  _params: Record<string, never>,
  { auth, toolContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, { toolContext });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }
  const pod = podResult.value.pod;

  const liveResult = await listDatabasesOnSandbox(auth, { space: pod });
  if (liveResult.isErr()) {
    return new Err(dbErrorToMCPError(liveResult.error));
  }

  const functions = await SandboxFunctionResource.listBySpace(auth, pod);
  const declaredBy = declaringFunctionsByDatabase(functions);

  return new Ok([
    { type: "text", text: formatDatabasesList(liveResult.value, declaredBy) },
  ]);
}
