import { ConfirmContext } from "@app/components/Confirm";
import type { CustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { useSendNotification } from "@app/hooks/useNotification";
import { useUpdatePodMetadata } from "@app/lib/swr/pods";
import type { PodFileTab, PodNavVisibility } from "@app/types/pod_file_tab";
import {
  DEFAULT_POD_FILE_TAB_ICON,
  MAX_POD_FILE_TAB_TITLE_LENGTH,
  MAX_POD_FILE_TABS,
  moveFileTabInTabsOrder,
  normalizeTabsOrder,
  podFileTabBasename,
  sortPodFileTabs,
} from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useContext, useMemo } from "react";

type FileTabOptions = {
  fileName?: string;
  title?: string;
  icon?: CustomResourceIconType;
  skipConfirm?: boolean;
};

export function usePodFileTabs({
  owner,
  podId,
  fileTabs,
  tabsOrder,
  isEditor,
}: {
  owner: LightWorkspaceType;
  podId: string;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
  isEditor: boolean;
}) {
  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const updatePodMetadata = useUpdatePodMetadata({
    owner,
    podId,
  });

  const sortedTabs = useMemo(() => sortPodFileTabs(fileTabs), [fileTabs]);
  const navOrder = useMemo(
    () =>
      normalizeTabsOrder(
        tabsOrder ?? [],
        sortedTabs.map((tab) => tab.path)
      ),
    [tabsOrder, sortedTabs]
  );

  const persist = useCallback(
    async (nextTabs: PodFileTab[], nextNavOrder: string[]) => {
      const normalizedTabs = sortPodFileTabs(nextTabs);
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

  const isFileTab = useCallback(
    (path: string) => sortedTabs.some((tab) => tab.path === path),
    [sortedTabs]
  );

  const addFileTab = useCallback(
    async (path: string, options?: FileTabOptions) => {
      if (!isEditor) {
        return false;
      }

      if (isFileTab(path)) {
        return true;
      }

      if (sortedTabs.length >= MAX_POD_FILE_TABS) {
        sendNotification({
          type: "error",
          title: "Pod tab limit reached",
          description: `A pod can have at most ${MAX_POD_FILE_TABS} custom tabs.`,
        });
        return false;
      }

      const label = (
        options?.title?.trim() || podFileTabBasename(options?.fileName ?? path)
      ).slice(0, MAX_POD_FILE_TAB_TITLE_LENGTH);

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

      const nextTabs: PodFileTab[] = [
        ...sortedTabs,
        {
          path,
          title: label,
          icon: options?.icon ?? DEFAULT_POD_FILE_TAB_ICON,
        },
      ];

      return persist(nextTabs, [...navOrder, path]);
    },
    [
      confirm,
      isEditor,
      isFileTab,
      navOrder,
      persist,
      sendNotification,
      sortedTabs,
    ]
  );

  const removeFileTab = useCallback(
    async (path: string, options?: FileTabOptions) => {
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

  const toggleFileTab = useCallback(
    async (path: string, options?: FileTabOptions) => {
      if (!isEditor) {
        return false;
      }
      if (isFileTab(path)) {
        return removeFileTab(path, options);
      }
      return addFileTab(path, options);
    },
    [addFileTab, isEditor, isFileTab, removeFileTab]
  );

  const updateFileTab = useCallback(
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

  const moveFileTab = useCallback(
    async (
      path: string,
      direction: "left" | "right",
      visibility: PodNavVisibility
    ) => {
      if (!isEditor) {
        return false;
      }

      const nextNavOrder = moveFileTabInTabsOrder(
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
    fileTabs: sortedTabs,
    tabsOrder: navOrder,
    isFileTab,
    addFileTab,
    removeFileTab,
    toggleFileTab,
    updateFileTab,
    moveFileTab,
  };
}
