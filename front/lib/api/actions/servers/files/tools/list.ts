import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import type { FileSystemMount } from "@app/lib/api/file_system/types";
import {
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system/types";
import { enrichListWithFileResourceIds } from "@app/lib/api/files/file_system_ops";
import { parseProcessedFilename } from "@app/lib/api/files/mount_path";
import {
  type ConversationWithoutContentType,
  isPodConversation,
} from "@app/types/assistant/conversation";
import {
  isInteractiveContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
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

function findConversationMount(
  mounts: ReadonlyArray<FileSystemMount>,
  conversationId: string
): FileSystemMount | undefined {
  return mounts.find(
    (m) => m.kind === "conversation" && m.id === conversationId
  );
}

function findPodMount(
  mounts: ReadonlyArray<FileSystemMount>,
  podId: string
): FileSystemMount | undefined {
  return mounts.find((m) => m.kind === "pod" && m.id === podId);
}

function defaultPodIdFromMounts(
  mounts: ReadonlyArray<FileSystemMount>,
  conversation: ConversationWithoutContentType
): string | undefined {
  if (!isPodConversation(conversation)) {
    return undefined;
  }

  const podMounts = mounts.filter((m) => m.kind === "pod");
  if (podMounts.length === 1) {
    return podMounts[0].id;
  }

  return podMounts[0]?.id;
}

type ListScope =
  | { type: "conversation"; conversation_id?: string }
  | { type: "pod"; pod_id?: string };

export async function listHandler(
  { scope }: { scope?: ListScope },
  extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation(extra);
  if (conversationRes.isErr()) {
    return conversationRes;
  }
  const conversation = conversationRes.value;

  const listScope: ListScope = scope ?? { type: "conversation" };
  const scopedPaths = scopedPathsFromArgs(
    listScope.type === "conversation" && listScope.conversation_id
      ? `${SCOPED_PREFIX_CONVERSATION}${listScope.conversation_id}/`
      : undefined,
    listScope.type === "pod" && listScope.pod_id
      ? `${SCOPED_PREFIX_POD}${listScope.pod_id}/`
      : undefined
  );

  const fsResult = await getDustFileSystemForAgentLoop(
    extra.auth,
    conversation,
    scopedPaths
  );
  if (fsResult.isErr()) {
    return fsResult;
  }
  const dustFs = fsResult.value;
  const mounts = dustFs.getMounts();

  let scopedPrefix: string;

  switch (listScope.type) {
    case "conversation": {
      const conversationId = listScope.conversation_id ?? conversation.sId;
      const mount = findConversationMount(mounts, conversationId);
      if (!mount) {
        return new Err(
          new MCPError(
            `Conversation not found or not accessible: ${conversationId}`,
            { tracked: false }
          )
        );
      }

      scopedPrefix = `${mount.scopedPrefix}/`;
      break;
    }
    case "pod": {
      const resolvedPodId =
        listScope.pod_id ?? defaultPodIdFromMounts(mounts, conversation);
      if (!resolvedPodId) {
        return new Err(
          new MCPError(
            'Pass `scope: { type: "pod", pod_id: "..." }` to list a Pod you can access, or run this from a Pod conversation.',
            { tracked: false }
          )
        );
      }

      const mount = findPodMount(mounts, resolvedPodId);
      if (!mount) {
        return new Err(
          new MCPError(`Pod not found or not accessible: ${resolvedPodId}`, {
            tracked: false,
          })
        );
      }

      scopedPrefix = `${mount.scopedPrefix}/`;
      break;
    }
    default:
      assertNever(listScope);
  }

  const listRes = await dustFs.list(scopedPrefix, { includeProcessed: true });
  if (listRes.isErr()) {
    return new Err(new MCPError("Failed to list files.", { tracked: true }));
  }

  // Enrich, so we can expose ids for interactive content files.
  const entries = await enrichListWithFileResourceIds(
    extra.auth,
    dustFs,
    listRes.value
  );

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
