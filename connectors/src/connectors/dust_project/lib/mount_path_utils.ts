import { PROJECT_CONTEXT_FOLDER_ID } from "@connectors/connectors/dust_project/lib/constants";
import { createHash } from "crypto";

const PROJECT_SCOPE_PREFIX = "project/";

/**
 * Strip the `project/` scope prefix from a scoped mount path.
 * Returns null when the path is not a project-scoped mount path.
 */
export function parseProjectScopedPath(scopedPath: string): string | null {
  if (!scopedPath.startsWith(PROJECT_SCOPE_PREFIX)) {
    return null;
  }

  const relativePath = scopedPath.slice(PROJECT_SCOPE_PREFIX.length);
  return relativePath.length > 0 ? relativePath : null;
}

export function getMountDirInternalId(
  projectId: string,
  relativeDirPath: string
): string {
  const h = createHash("sha256")
    .update(`dust-project:${projectId}:dir:${relativeDirPath}`, "utf8")
    .digest("hex")
    .slice(0, 16);
  return `dpd_${h}`;
}

/**
 * Build parent relationships from a path within the project mount.
 *
 * For `reports/q1/summary.pdf`:
 * - parents: [q1DirId, reportsDirId, PROJECT_CONTEXT_FOLDER_ID]
 * - parentInternalId: q1DirId
 *
 * For `summary.pdf`:
 * - parents: [PROJECT_CONTEXT_FOLDER_ID]
 * - parentInternalId: PROJECT_CONTEXT_FOLDER_ID
 */
export function buildMountDirectoryParents(
  projectId: string,
  pathWithinMount: string
): {
  parentInternalId: string;
  parents: string[];
} {
  const pathParts = pathWithinMount
    .split("/")
    .filter((part) => part.trim() !== "");

  // Remove the last segment (file name or directory name).
  const directoryParts = pathParts.slice(0, -1);

  if (directoryParts.length === 0) {
    return {
      parentInternalId: PROJECT_CONTEXT_FOLDER_ID,
      parents: [PROJECT_CONTEXT_FOLDER_ID],
    };
  }

  const parents = [PROJECT_CONTEXT_FOLDER_ID];

  for (let i = 1; i <= directoryParts.length; i++) {
    const dirPath = directoryParts.slice(0, i).join("/");
    parents.push(getMountDirInternalId(projectId, dirPath));
  }

  parents.reverse();

  const immediateParentPath = directoryParts.join("/");
  const parentInternalId = getMountDirInternalId(
    projectId,
    immediateParentPath
  );

  return {
    parentInternalId,
    parents,
  };
}

export function inferMountFileParents({
  projectId,
  pathWithinMount,
  documentId,
}: {
  projectId: string;
  pathWithinMount: string;
  documentId: string;
}): {
  parentInternalId: string;
  parents: string[];
} {
  const { parentInternalId, parents: directoryParents } =
    buildMountDirectoryParents(projectId, pathWithinMount);

  return {
    parentInternalId,
    parents: [documentId, ...directoryParents],
  };
}

/**
 * Returns mount directory paths from shallowest to deepest for a file path.
 * For `reports/q1/summary.pdf`, returns [`reports`, `reports/q1`].
 */
export function getMountDirectoryPrefixes(pathWithinMount: string): string[] {
  const pathParts = pathWithinMount
    .split("/")
    .filter((part) => part.trim() !== "");
  const directoryParts = pathParts.slice(0, -1);

  return directoryParts.map((_, index) =>
    directoryParts.slice(0, index + 1).join("/")
  );
}

/**
 * Returns mount directory parent paths from shallowest to deepest for a directory path.
 * For `reports/q1`, returns [`reports`].
 */
export function getMountDirectoryParentPrefixes(
  relativeDirPath: string
): string[] {
  const pathParts = relativeDirPath
    .split("/")
    .filter((part) => part.trim() !== "");
  if (pathParts.length <= 1) {
    return [];
  }

  const parentParts = pathParts.slice(0, -1);
  return parentParts.map((_, index) =>
    parentParts.slice(0, index + 1).join("/")
  );
}

export function sortEntriesByScopedPathDepth<T extends { path: string }>(
  entries: T[]
): T[] {
  return [...entries].sort(
    (a, b) => a.path.split("/").length - b.path.split("/").length
  );
}
