import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { DustFileSystem } from "@app/lib/api/file_system";
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
  { scope }: { scope?: "conversation" | "project" },
  extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversation = extra.agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(
      new MCPError("No conversation context available.", { tracked: false })
    );
  }

  const fsResult = await DustFileSystem.forConversation(
    extra.auth,
    conversation
  );
  if (fsResult.isErr()) {
    return new Err(
      new MCPError(fsResult.error.message, { tracked: false })
    );
  }
  const fs = fsResult.value;

  const useCase = scope ?? "conversation";
  let scopedPrefix: string | undefined;

  if (useCase === "conversation") {
    const mount = fs.getMounts().find((m) => m.kind === "conversation");
    scopedPrefix = mount ? `${mount.scopedPrefix}/` : undefined;
  } else {
    const mount = fs.getMounts().find((m) => m.kind === "pod");
    if (!mount) {
      return new Err(
        new MCPError(
          "Project file paths are only available in project conversations.",
          { tracked: false }
        )
      );
    }
    if (!mount.permissions.canRead) {
      return new Err(
        new MCPError(
          "You do not have read permissions for this project.",
          { tracked: false }
        )
      );
    }
    scopedPrefix = `${mount.scopedPrefix}/`;
  }

  const entries = await fs.list(scopedPrefix, { includeProcessed: true });

  const [dirs, files] = partition(entries, (e) => e.isDirectory);

  if (dirs.length === 0 && files.length === 0) {
    return new Ok([{ type: "text", text: "No files available." }]);
  }

  const nonEmptyDirPaths = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length - 1; i++) {
      nonEmptyDirPaths.add(parts.slice(0, i + 1).join("/"));
    }
  }

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
    if (file.isDirectory) {
      continue;
    }
    const mimeType = stripMimeParameters(file.contentType);
    const kb = Math.ceil(file.sizeBytes / 1024);
    const annotation = sourcePath
      ? ` (processed version of ${sourcePath})`
      : "";
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
