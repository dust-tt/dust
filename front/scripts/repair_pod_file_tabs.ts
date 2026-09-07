/**
 * Repair stale Pod file-tab paths (including the pinned frame path) after
 * files are moved or renamed.
 *
 * Dry run for one Pod:
 *   npx tsx scripts/repair_pod_file_tabs.ts \
 *     --workspaceId <workspace-sId> --podId <pod-sId>
 *
 * Remove missing tabs:
 *   npx tsx scripts/repair_pod_file_tabs.ts \
 *     --workspaceId <workspace-sId> --podId <pod-sId> \
 *     --dropMissing --execute
 *
 * Remap moved tabs, repeat --map for multiple paths:
 *   npx tsx scripts/repair_pod_file_tabs.ts \
 *     --workspaceId <workspace-sId> --podId <pod-sId> \
 *     --map <old-path>=<new-path> --execute
 *
 * The script is intentionally scoped to one Pod and is dry-run by default.
 */

import { isFilePreviewableContentType } from "@app/components/file_explorer/utils";
import { DustFileSystem } from "@app/lib/api/file_system";
import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { isInteractiveContentType } from "@app/types/files";
import { resolveCanonicalScopedPath } from "@app/types/mount_path";
import type { PodFileTab } from "@app/types/pod_file_tab";
import {
  MAX_POD_FILE_TABS,
  normalizeTabsOrder,
  sortPodFileTabs,
} from "@app/types/pod_file_tab";

import { makeScript } from "./helpers";

type FileTabRepairStat = { contentType: string } | null;

type RepairPodFileTabsParams = {
  spaceId: string;
  frameTabs: PodFileTab[];
  tabsOrder: string[];
  pinnedFramePath: string | null;
  pathMappings: ReadonlyMap<string, string>;
  dropMissing: boolean;
  canonicalizePath: (path: string) => string | null;
  stat: (path: string) => Promise<FileTabRepairStat>;
};

type RepairPodFileTabsResult = {
  frameTabs: PodFileTab[];
  tabsOrder: string[];
  pinnedFramePath: string | null;
  removedPaths: string[];
  remappedPaths: Array<{ oldPath: string; newPath: string }>;
};

/**
 * Repairs persisted Pod file-tab metadata (file tabs, tabs order and pinned
 * frame path) after files have been moved or renamed. Missing paths are only
 * removed when explicitly requested with dropMissing. Throws when a --map
 * source matches neither a file tab nor the pinned frame, so operator typos
 * never silently no-op.
 */
async function repairPodFileTabs({
  spaceId,
  frameTabs,
  tabsOrder,
  pinnedFramePath,
  pathMappings,
  dropMissing,
  canonicalizePath,
  stat,
}: RepairPodFileTabsParams): Promise<RepairPodFileTabsResult> {
  const repairedTabs: PodFileTab[] = [];
  const removedPaths: string[] = [];
  const remappedPaths: Array<{ oldPath: string; newPath: string }> = [];
  const seenPaths = new Set<string>();
  const pathRemap = new Map<string, string>();
  const usedMappingSources = new Set<string>();

  for (const tab of frameTabs) {
    const canonicalPath = canonicalizePath(tab.path);
    if (!canonicalPath) {
      throw new Error(`Invalid file tab path: ${tab.path}`);
    }

    if (pathMappings.has(canonicalPath)) {
      usedMappingSources.add(canonicalPath);
    }

    const newPath = pathMappings.get(canonicalPath) ?? canonicalPath;
    const statResult = await stat(newPath);

    if (!statResult) {
      if (!dropMissing) {
        throw new Error(`File tab file not found: ${newPath}`);
      }

      removedPaths.push(tab.path);
      continue;
    }

    if (!isFilePreviewableContentType(statResult.contentType)) {
      throw new Error(`File tab path is not a previewable file: ${newPath}`);
    }

    if (seenPaths.has(newPath)) {
      throw new Error(`Duplicate file tab path after repair: ${newPath}`);
    }
    seenPaths.add(newPath);

    pathRemap.set(tab.path, newPath);
    pathRemap.set(canonicalPath, newPath);
    if (newPath !== canonicalPath) {
      remappedPaths.push({ oldPath: canonicalPath, newPath });
    }

    repairedTabs.push({
      path: newPath,
      title: tab.title,
      icon: tab.icon,
    });
  }

  // Checked on the output rather than the input so the script can repair a Pod
  // whose persisted metadata is already over the limit, as long as the repair
  // brings it back under.
  if (repairedTabs.length > MAX_POD_FILE_TABS) {
    throw new Error(
      `Repair would leave ${repairedTabs.length} file tabs on Pod ${spaceId}, exceeding the maximum of ${MAX_POD_FILE_TABS}.`
    );
  }

  // The pinned frame is stored next to the tabs and goes stale the same way.
  // It does not have to be a tab: it only has to point at an existing frame.
  let repairedPinnedFramePath: string | null = null;
  if (pinnedFramePath !== null) {
    const canonicalPinned = canonicalizePath(pinnedFramePath);
    if (!canonicalPinned) {
      throw new Error(`Invalid pinned frame path: ${pinnedFramePath}`);
    }

    if (pathMappings.has(canonicalPinned)) {
      usedMappingSources.add(canonicalPinned);
    }

    const newPinned =
      pathRemap.get(canonicalPinned) ??
      pathMappings.get(canonicalPinned) ??
      canonicalPinned;
    const pinnedStat = await stat(newPinned);

    if (!pinnedStat) {
      if (!dropMissing) {
        throw new Error(`Pinned frame file not found: ${newPinned}`);
      }
      removedPaths.push(pinnedFramePath);
    } else if (!isInteractiveContentType(pinnedStat.contentType)) {
      throw new Error(
        `Pinned frame path is not an interactive frame: ${newPinned}`
      );
    } else {
      repairedPinnedFramePath = newPinned;
      if (newPinned !== canonicalPinned) {
        remappedPaths.push({ oldPath: canonicalPinned, newPath: newPinned });
      }
    }
  }

  const unusedMappingSources = [...pathMappings.keys()].filter(
    (source) => !usedMappingSources.has(source)
  );
  if (unusedMappingSources.length > 0) {
    throw new Error(
      `--map source paths matched no file tab or pinned frame: ${unusedMappingSources.join(", ")}`
    );
  }

  const remappedTabsOrder = tabsOrder.map((entry) => {
    const directRemap = pathRemap.get(entry) ?? pathMappings.get(entry);
    if (directRemap) {
      return directRemap;
    }

    const canonicalEntry = canonicalizePath(entry);
    return canonicalEntry
      ? (pathRemap.get(canonicalEntry) ?? canonicalEntry)
      : entry;
  });

  return {
    frameTabs: sortPodFileTabs(repairedTabs),
    tabsOrder: normalizeTabsOrder(
      remappedTabsOrder,
      repairedTabs.map((tab) => tab.path)
    ),
    pinnedFramePath: repairedPinnedFramePath,
    removedPaths,
    remappedPaths,
  };
}

function parsePathMappings(
  mappings: string[] | undefined,
  spaceId: string
): Map<string, string> {
  const result = new Map<string, string>();
  const destinations = new Set<string>();

  for (const mapping of mappings ?? []) {
    const separator = mapping.indexOf("=");
    if (separator <= 0 || separator === mapping.length - 1) {
      throw new Error(
        `Invalid --map value: ${mapping}. Expected oldPath=newPath.`
      );
    }

    const oldPath = resolveCanonicalScopedPath(mapping.slice(0, separator), {
      conversationId: null,
      spaceId,
    });
    const newPath = resolveCanonicalScopedPath(mapping.slice(separator + 1), {
      conversationId: null,
      spaceId,
    });

    if (!oldPath || !newPath) {
      throw new Error(
        `Invalid --map value: ${mapping}. Paths must be Pod-scoped.`
      );
    }
    if (result.has(oldPath)) {
      throw new Error(`Duplicate --map source path: ${oldPath}`);
    }
    if (destinations.has(newPath)) {
      throw new Error(`Duplicate --map destination path: ${newPath}`);
    }

    result.set(oldPath, newPath);
    destinations.add(newPath);
  }

  return result;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      describe: "Workspace sId containing the Pod.",
      demandOption: true,
    },
    podId: {
      type: "string",
      describe: "Pod space sId to repair.",
      demandOption: true,
    },
    dropMissing: {
      type: "boolean",
      describe: "Remove tabs whose Frame paths no longer resolve.",
      default: false,
    },
    map: {
      type: "array",
      describe:
        "Map an old Frame path to a new path. Repeat for multiple paths.",
      string: true,
      default: [],
    },
  },
  async ({ workspaceId, podId, dropMissing, map, execute }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const pod = await SpaceResource.fetchById(auth, podId);
    if (!pod) {
      throw new Error(`Pod not found: ${podId}`);
    }
    if (!pod.isProject()) {
      throw new Error(`Space is not a Pod: ${podId}`);
    }

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
    if (!metadata) {
      logger.info({ workspaceId, podId }, "Pod has no project metadata.");
      return;
    }

    const fsResult = await DustFileSystem.forPod(auth, pod);
    if (fsResult.isErr()) {
      throw new Error(
        `Failed to initialize Pod file system: ${fsResult.error.message}`
      );
    }
    const fs = fsResult.value;
    const pathMappings = parsePathMappings(map, pod.sId);

    const repaired = await repairPodFileTabs({
      spaceId: pod.sId,
      frameTabs: metadata.frameTabs ?? [],
      tabsOrder: metadata.tabsOrder ?? [],
      pinnedFramePath: metadata.pinnedFramePath ?? null,
      pathMappings,
      dropMissing,
      canonicalizePath: (path) =>
        resolveCanonicalScopedPath(path, {
          conversationId: null,
          spaceId: pod.sId,
        }),
      stat: async (path) => {
        const statResult = await fs.stat(path);
        if (statResult.isErr()) {
          if (statResult.error.code === "not_found") {
            return null;
          }
          throw new Error(
            `Failed to stat ${path}: ${statResult.error.message}`
          );
        }
        return statResult.value;
      },
    });

    const changed =
      JSON.stringify(metadata.frameTabs ?? []) !==
        JSON.stringify(repaired.frameTabs) ||
      JSON.stringify(metadata.tabsOrder ?? []) !==
        JSON.stringify(repaired.tabsOrder) ||
      (metadata.pinnedFramePath ?? null) !== repaired.pinnedFramePath;

    logger.info(
      {
        workspaceId,
        podId,
        execute,
        dropMissing,
        originalFrameTabs: metadata.frameTabs ?? [],
        repairedFrameTabs: repaired.frameTabs,
        originalTabsOrder: metadata.tabsOrder ?? [],
        repairedTabsOrder: repaired.tabsOrder,
        originalPinnedFramePath: metadata.pinnedFramePath ?? null,
        repairedPinnedFramePath: repaired.pinnedFramePath,
        removedPaths: repaired.removedPaths,
        remappedPaths: repaired.remappedPaths,
      },
      changed
        ? execute
          ? "Repairing Pod frame-tab metadata."
          : "Would repair Pod frame-tab metadata."
        : "Pod frame-tab metadata is already healthy."
    );

    if (!execute || !changed) {
      return;
    }

    // /!\ No lock is taken against concurrent tab edits — run against a
    // quiet Pod.
    await frontSequelize.transaction(async (transaction) => {
      await metadata.updateFileTabs(
        repaired.frameTabs,
        repaired.tabsOrder,
        transaction
      );
      await metadata.updatePinnedFramePath(
        repaired.pinnedFramePath,
        transaction
      );
    });

    logger.info({ workspaceId, podId }, "Pod frame-tab metadata repaired.");
  }
);
