import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { resolveMountPoint } from "@app/lib/api/actions/servers/files/tools/utils";
import { listGCSMountFiles } from "@app/lib/api/files/gcs_mount/files";
import { stripMimeParameters } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import partition from "lodash/partition";

export async function listHandler(
  _params: Record<string, never>,
  extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const mountRes = resolveMountPoint(
    extra.auth,
    extra.agentLoopContext?.runContext?.conversation
  );
  if (mountRes.isErr()) {
    return mountRes;
  }

  const entries = await listGCSMountFiles(extra.auth, mountRes.value.scope);

  const [dirs, files] = partition(entries, (e) => e.isDirectory);

  if (dirs.length === 0 && files.length === 0) {
    return new Ok([{ type: "text", text: "No files available." }]);
  }

  // Build the set of all ancestor dir paths that contain at least one file.
  // O(m × depth). Deph is typically small.
  const nonEmptyDirPaths = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length - 1; i++) {
      nonEmptyDirPaths.add(parts.slice(0, i + 1).join("/"));
    }
  }

  const lines: string[] = [];

  for (const dir of dirs) {
    if (!nonEmptyDirPaths.has(dir.path)) {
      lines.push(`${dir.path}/ [empty directory]`);
    }
  }

  for (const file of files) {
    const mimeType = stripMimeParameters(file.contentType);
    const kb = Math.ceil(file.sizeBytes / 1024);
    lines.push(`${file.path} (${mimeType}, ${kb} KB)`);
  }

  return new Ok([{ type: "text", text: lines.join("\n") }]);
}
