import { listAddablePodTabFiles } from "@app/components/pod/files/addablePodTabFiles";
import type { AddablePodTabFile } from "@app/components/pod/settings/AddPodFileMenu";
import { AddPodFileMenu } from "@app/components/pod/settings/AddPodFileMenu";
import { usePodFileTabs } from "@app/hooks/usePodFileTabs";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { usePodFiles } from "@app/lib/swr/pods";
import type { PodFileTab } from "@app/types/pod_file_tab";
import { MAX_POD_FILE_TABS } from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, cn, Plus } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface PodNavAddFileTabButtonProps {
  owner: LightWorkspaceType;
  podId: string;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
}

/**
 * Hover-reveal "+" next to Pod nav tabs that opens the same searchable file
 * picker used in Settings → Tabs customization.
 */
export function PodNavAddFileTabButton({
  owner,
  podId,
  fileTabs,
  tabsOrder,
}: PodNavAddFileTabButtonProps) {
  const { hasFeature } = useFeatureFlags();
  const displayFramePackages = hasFeature("frames_v2");

  const { addFileTab } = usePodFileTabs({
    owner,
    podId,
    fileTabs,
    tabsOrder,
    isEditor: true,
  });

  const { files: podFiles } = usePodFiles({
    owner,
    podId,
  });

  const existingTabPaths = useMemo(
    () => new Set(fileTabs.map((tab) => tab.path)),
    [fileTabs]
  );

  const addableFiles = useMemo(
    () =>
      listAddablePodTabFiles({
        podFiles,
        existingTabPaths,
        displayFramePackages,
      }),
    [displayFramePackages, existingTabPaths, podFiles]
  );

  const atTabLimit = fileTabs.length >= MAX_POD_FILE_TABS;

  const handleAddFile = (file: AddablePodTabFile) => {
    void addFileTab(file.path, {
      fileName: file.fileName,
      skipConfirm: true,
    });
  };

  return (
    <div
      className={cn(
        "transition-opacity",
        "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
        "group-hover/pod-tabs:opacity-100 group-focus-within/pod-tabs:opacity-100",
        "has-[[data-state=open]]:opacity-100"
      )}
    >
      <AddPodFileMenu
        files={addableFiles}
        onSelect={handleAddFile}
        trigger={
          <Button
            size="xs"
            variant="ghost"
            icon={Plus}
            tooltip={
              atTabLimit
                ? `A pod can have at most ${MAX_POD_FILE_TABS} custom tabs.`
                : "Add file to Tabs"
            }
            disabled={atTabLimit}
          />
        }
      />
    </div>
  );
}
