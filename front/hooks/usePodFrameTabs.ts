import { ConfirmContext } from "@app/components/Confirm";
import { useSendNotification } from "@app/hooks/useNotification";
import { useUpdatePodMetadata } from "@app/lib/swr/pods";
import type { PodFrameTab, PodNavVisibility } from "@app/types/pod_frame_tab";
import {
  DEFAULT_POD_FRAME_TAB_ICON,
  MAX_POD_FRAME_TAB_TITLE_LENGTH,
  MAX_POD_FRAME_TABS,
  moveFrameTabInTabsOrder,
  normalizeTabsOrder,
  podFrameTabBasename,
  sortPodFrameTabs,
} from "@app/types/pod_frame_tab";
import type { CustomResourceIconType } from "@app/types/resources_icon_names";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useContext, useMemo } from "react";

type FrameTabOptions = {
  fileName?: string;
  title?: string;
  icon?: CustomResourceIconType;
  skipConfirm?: boolean;
};

export function usePodFrameTabs({
  owner,
  podId,
  frameTabs,
  tabsOrder,
  isEditor,
}: {
  owner: LightWorkspaceType;
  podId: string;
  frameTabs: PodFrameTab[];
  tabsOrder?: string[];
  isEditor: boolean;
}) {
  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const updatePodMetadata = useUpdatePodMetadata({
    owner,
    podId,
  });

  const sortedTabs = useMemo(() => sortPodFrameTabs(frameTabs), [frameTabs]);
  const navOrder = useMemo(
    () =>
      normalizeTabsOrder(
        tabsOrder ?? [],
        sortedTabs.map((tab) => tab.path)
      ),
    [tabsOrder, sortedTabs]
  );

  const persist = useCallback(
    async (nextTabs: PodFrameTab[], nextNavOrder: string[]) => {
      const normalizedTabs = sortPodFrameTabs(nextTabs);
      const normalizedNavOrder = normalizeTabsOrder(
        nextNavOrder,
        normalizedTabs.map((tab) => tab.path)
      );
      const result = await updatePodMetadata({
        frameTabs: normalizedTabs,
        tabsOrder: normalizedNavOrder,
      });
      return result !== null;
    },
    [updatePodMetadata]
  );

  const isFrameTab = useCallback(
    (path: string) => sortedTabs.some((tab) => tab.path === path),
    [sortedTabs]
  );

  const addFrameTab = useCallback(
    async (path: string, options?: FrameTabOptions) => {
      if (!isEditor) {
        return false;
      }

      if (isFrameTab(path)) {
        return true;
      }

      if (sortedTabs.length >= MAX_POD_FRAME_TABS) {
        sendNotification({
          type: "error",
          title: "Frame tab limit reached",
          description: `A pod can have at most ${MAX_POD_FRAME_TABS} frame tabs.`,
        });
        return false;
      }

      const label = (
        options?.title?.trim() || podFrameTabBasename(options?.fileName ?? path)
      ).slice(0, MAX_POD_FRAME_TAB_TITLE_LENGTH);

      if (!options?.skipConfirm) {
        const confirmed = await confirm({
          title: "Add as Pod tab?",
          message: `"${label}" will appear as a tab in this Pod for all members.`,
          validateLabel: "Add tab",
          validateVariant: "primary",
        });
        if (!confirmed) {
          return false;
        }
      }

      const nextTabs: PodFrameTab[] = [
        ...sortedTabs,
        {
          path,
          title: label,
          icon: options?.icon ?? DEFAULT_POD_FRAME_TAB_ICON,
        },
      ];

      return persist(nextTabs, [...navOrder, path]);
    },
    [
      confirm,
      isEditor,
      isFrameTab,
      navOrder,
      persist,
      sendNotification,
      sortedTabs,
    ]
  );

  const removeFrameTab = useCallback(
    async (path: string, options?: FrameTabOptions) => {
      if (!isEditor) {
        return false;
      }

      const existing = sortedTabs.find((tab) => tab.path === path);
      if (!existing) {
        return true;
      }

      const label = options?.fileName ?? existing.title;

      if (!options?.skipConfirm) {
        const confirmed = await confirm({
          title: "Remove Pod tab?",
          message: `"${label}" will no longer appear as a tab in this Pod.`,
          validateLabel: "Remove",
          validateVariant: "warning",
        });
        if (!confirmed) {
          return false;
        }
      }

      return persist(
        sortedTabs.filter((tab) => tab.path !== path),
        navOrder.filter((entry) => entry !== path)
      );
    },
    [confirm, isEditor, navOrder, persist, sortedTabs]
  );

  const toggleFrameTab = useCallback(
    async (path: string, options?: FrameTabOptions) => {
      if (!isEditor) {
        return false;
      }
      if (isFrameTab(path)) {
        return removeFrameTab(path, options);
      }
      return addFrameTab(path, options);
    },
    [addFrameTab, isEditor, isFrameTab, removeFrameTab]
  );

  const updateFrameTab = useCallback(
    async (
      path: string,
      updates: {
        title?: string;
        icon?: CustomResourceIconType;
      }
    ) => {
      if (!isEditor) {
        return false;
      }

      const nextTabs = sortedTabs.map((tab) => {
        if (tab.path !== path) {
          return tab;
        }
        return {
          ...tab,
          title: updates.title?.trim() || tab.title,
          icon: updates.icon ?? tab.icon,
        };
      });

      return persist(nextTabs, navOrder);
    },
    [isEditor, navOrder, persist, sortedTabs]
  );

  const moveFrameTab = useCallback(
    async (
      path: string,
      direction: "left" | "right",
      visibility: PodNavVisibility
    ) => {
      if (!isEditor) {
        return false;
      }

      const nextNavOrder = moveFrameTabInTabsOrder(
        navOrder,
        path,
        direction,
        visibility
      );
      if (!nextNavOrder) {
        return false;
      }

      return persist(sortedTabs, nextNavOrder);
    },
    [isEditor, navOrder, persist, sortedTabs]
  );

  return {
    frameTabs: sortedTabs,
    tabsOrder: navOrder,
    isFrameTab,
    addFrameTab,
    removeFrameTab,
    toggleFrameTab,
    updateFrameTab,
    moveFrameTab,
  };
}
