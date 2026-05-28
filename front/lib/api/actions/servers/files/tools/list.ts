import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { resolveMountByUseCase } from "@app/lib/api/actions/servers/files/tools/utils";
import { listGCSMountFiles } from "@app/lib/api/files/gcs_mount/files";
import { parseProcessedFilename } from "@app/lib/api/files/mount_path";
import {
  isInteractiveContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import partition from "lodash/partition";

function getDirAndFileName(path: string): { dir: string; fileName: string } {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash < 0) {
    return { dir: "", fileName: path };
  }

  return {
    dir: path.substring(0, lastSlash),
    fileName: path.substring(lastSlash + 1),
  };
}

export async function listHandler(
  { scope }: { scope?: "conversation" | "pod" },
  extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversation = extra.agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(
      new MCPError("No conversation context available.", { tracked: false })
    );
  }

  const useCase = scope ?? "conversation";
  const mountRes = await resolveMountByUseCase(extra.auth, conversation, {
    useCase,
    access: "read",
  });
  if (mountRes.isErr()) {
    return mountRes;
  }

  const entries = await listGCSMountFiles(extra.auth, mountRes.value.scope, {
    includeProcessed: true,
  });

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

  // Index sources by `<dir>/<basename-without-extension>` so we can look up the source for each
  // `*.processed.<ext>` sibling.
  const sourcePathByKey = new Map<string, string>();
  for (const file of files) {
    const { dir, fileName } = getDirAndFileName(file.path);
    if (parseProcessedFilename(fileName).isProcessed) {
      continue;
    }

    const lastDot = fileName.lastIndexOf(".");
    const base = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
    sourcePathByKey.set(`${dir}/${base}`, file.path);
  }

  // For each file, compute (sortKey, isProcessed) so that processed siblings sort right after
  // their source. Falls back to the file's own path when no source is found (orphan processed file).
  const annotated = files.map((file) => {
    const { dir, fileName } = getDirAndFileName(file.path);
    const parsed = parseProcessedFilename(fileName);
    if (!parsed.isProcessed) {
      return { file, sortKey: file.path, tieBreak: 0, sourcePath: null };
    }

    const sourcePath =
      sourcePathByKey.get(`${dir}/${parsed.sourceBaseName}`) ?? null;

    return {
      file,
      sortKey: sourcePath ?? file.path,
      tieBreak: sourcePath ? 1 : 0,
      sourcePath,
    };
  });

  annotated.sort(
    (a, b) => a.sortKey.localeCompare(b.sortKey) || a.tieBreak - b.tieBreak
  );

  const lines: string[] = [];

  for (const dir of dirs) {
    if (!nonEmptyDirPaths.has(dir.path)) {
      lines.push(`${dir.path}/ [empty directory]`);
    }
  }

  for (const { file, sourcePath } of annotated) {
    const mimeType = stripMimeParameters(file.contentType);
    const kb = Math.ceil(file.sizeBytes / 1024);
    const annotation = sourcePath
      ? ` (processed version of ${sourcePath})`
      : "";
    // Frames are created and updated via the interactive_content MCP server, which
    // identifies them by file ID rather than path. Exposing the ID here lets the agent
    // reference the correct frame when calling those tools.
    const fileIdSuffix =
      isInteractiveContentType(mimeType) && file.fileId
        ? ` [id: ${file.fileId}]`
        : "";
    lines.push(
      `${file.path} (${mimeType}, ${kb} KB)${fileIdSuffix}${annotation}`
    );
  }

  return new Ok([{ type: "text", text: lines.join("\n") }]);
}
