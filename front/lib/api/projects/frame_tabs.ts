import { isFilePreviewableContentType } from "@app/components/file_explorer/utils";
import { DustFileSystem } from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { resolveCanonicalScopedPath } from "@app/types/mount_path";
import type { PodFrameTab, PodTabsOrder } from "@app/types/pod_frame_tab";
import {
  MAX_POD_FRAME_TABS,
  normalizeTabsOrder,
  POD_NAV_SYSTEM_TABS_BEFORE_SETTINGS,
  sortPodFrameTabs,
} from "@app/types/pod_frame_tab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Validate Pod file tabs + nav order for a project space.
 *
 * Any previewable file (frames, markdown, PDFs, images, etc.) can be a tab.
 * Paths are canonicalized via resolveCanonicalScopedPath (same as pinned frames)
 * so accepted aliases like `project/...` / `pod/...` become `pod-{spaceId}/...`.
 */
export async function validatePodFrameTabs(
  auth: Authenticator,
  space: SpaceResource,
  frameTabs: PodFrameTab[],
  tabsOrder: PodTabsOrder | undefined,
  options?: {
    /**
     * Canonical frame tab paths already stored on the Pod. File existence is
     * not re-checked for these paths so members can remove or reorder tabs
     * even when another tab still points at a moved or deleted Frame.
     */
    existingFrameTabPaths?: ReadonlySet<string>;
  }
): Promise<Result<{ frameTabs: PodFrameTab[]; tabsOrder: string[] }, Error>> {
  if (frameTabs.length > MAX_POD_FRAME_TABS) {
    return new Err(
      new Error(`A pod can have at most ${MAX_POD_FRAME_TABS} frame tabs.`)
    );
  }

  const fsResult = await DustFileSystem.forPod(auth, space);
  if (fsResult.isErr()) {
    return new Err(new Error("Failed to initialize file system."));
  }
  const fs = fsResult.value;

  const seenPaths = new Set<string>();
  const normalized: PodFrameTab[] = [];
  const pathRemap = new Map<string, string>();

  for (const tab of frameTabs) {
    const normalizedPath = resolveCanonicalScopedPath(tab.path, {
      conversationId: null,
      spaceId: space.sId,
    });
    if (!normalizedPath) {
      return new Err(new Error(`Invalid frame tab path: ${tab.path}`));
    }

    if (seenPaths.has(normalizedPath)) {
      return new Err(new Error(`Duplicate frame tab path: ${normalizedPath}`));
    }
    seenPaths.add(normalizedPath);
    pathRemap.set(tab.path, normalizedPath);

    const isExistingTab =
      options?.existingFrameTabPaths?.has(normalizedPath) ?? false;
    if (!isExistingTab) {
      const statResult = await fs.stat(normalizedPath);
      if (statResult.isErr() || !statResult.value) {
        return new Err(
          new Error(`Frame tab file not found: ${normalizedPath}`)
        );
      }

      if (!isFilePreviewableContentType(statResult.value.contentType)) {
        return new Err(
          new Error(
            `Frame tab path is not a previewable file: ${normalizedPath}`
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
    frameTabs: sortPodFrameTabs(normalized),
    tabsOrder: normalizedTabsOrder,
  });
}
