import { isFilePreviewableContentType } from "@app/components/file_explorer/utils";
import { DustFileSystem } from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { resolveCanonicalScopedPath } from "@app/types/mount_path";
import type { PodFileTab, PodTabsOrder } from "@app/types/pod_file_tab";
import {
  MAX_POD_FILE_TABS,
  normalizeTabsOrder,
  POD_NAV_SYSTEM_TABS_BEFORE_SETTINGS,
  sortPodFileTabs,
} from "@app/types/pod_file_tab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Validate Pod file tabs + nav order for a project space.
 *
 * Any previewable file (frames, markdown, PDFs, images, etc.) can be a tab.
 * Paths are canonicalized via resolveCanonicalScopedPath (same as pinned frames)
 * so accepted aliases like `project/...` / `pod/...` become `pod-{spaceId}/...`.
 */
export async function validatePodFileTabs(
  auth: Authenticator,
  space: SpaceResource,
  fileTabs: PodFileTab[],
  tabsOrder: PodTabsOrder | undefined,
  options?: {
    /**
     * Canonical file tab paths already stored on the Pod. File existence is
     * not re-checked for these paths so members can remove or reorder tabs
     * even when another tab still points at a moved or deleted Frame.
     */
    existingFileTabPaths?: ReadonlySet<string>;
  }
): Promise<Result<{ fileTabs: PodFileTab[]; tabsOrder: string[] }, Error>> {
  if (fileTabs.length > MAX_POD_FILE_TABS) {
    return new Err(
      new Error(`A pod can have at most ${MAX_POD_FILE_TABS} file tabs.`)
    );
  }

  const fsResult = await DustFileSystem.forPod(auth, space);
  if (fsResult.isErr()) {
    return new Err(new Error("Failed to initialize file system."));
  }
  const fs = fsResult.value;

  const seenPaths = new Set<string>();
  const normalized: PodFileTab[] = [];
  const pathRemap = new Map<string, string>();

  for (const tab of fileTabs) {
    const normalizedPath = resolveCanonicalScopedPath(tab.path, {
      conversationId: null,
      spaceId: space.sId,
    });
    if (!normalizedPath) {
      return new Err(new Error(`Invalid file tab path: ${tab.path}`));
    }

    if (seenPaths.has(normalizedPath)) {
      return new Err(new Error(`Duplicate file tab path: ${normalizedPath}`));
    }
    seenPaths.add(normalizedPath);
    pathRemap.set(tab.path, normalizedPath);

    const isExistingTab =
      options?.existingFileTabPaths?.has(normalizedPath) ?? false;
    if (!isExistingTab) {
      const statResult = await fs.stat(normalizedPath);
      if (statResult.isErr() || !statResult.value) {
        return new Err(new Error(`File tab file not found: ${normalizedPath}`));
      }

      if (!isFilePreviewableContentType(statResult.value.contentType)) {
        return new Err(
          new Error(
            `File tab path is not a previewable file: ${normalizedPath}`
          )
        );
      }
    }

    normalized.push({
      path: normalizedPath,
      title: tab.title.trim(),
      icon: tab.icon,
    });
  }

  const remappedTabsOrder = (tabsOrder ?? []).map(
    (entry) => pathRemap.get(entry) ?? entry
  );
  const normalizedTabsOrder = normalizeTabsOrder(
    remappedTabsOrder,
    normalized.map((tab) => tab.path)
  );

  for (const id of POD_NAV_SYSTEM_TABS_BEFORE_SETTINGS) {
    if (!normalizedTabsOrder.includes(id)) {
      return new Err(new Error(`Nav order is missing system tab: ${id}`));
    }
  }

  return new Ok({
    fileTabs: sortPodFileTabs(normalized),
    tabsOrder: normalizedTabsOrder,
  });
}
