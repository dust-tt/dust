import { EditPodFrameTabDialog } from "@app/components/pod/files/EditPodFrameTabDialog";
import { usePodFrameTabs } from "@app/hooks/usePodFrameTabs";
import type { PodFrameTab } from "@app/types/pod_frame_tab";
import {
  DEFAULT_POD_FRAME_TAB_ICON,
  MAX_POD_FRAME_TAB_TITLE_LENGTH,
  podFrameTabBasename,
} from "@app/types/pod_frame_tab";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, LayoutAlt02 } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface PodFrameTabButtonProps {
  owner: LightWorkspaceType;
  spaceId: string;
  frameTabs: PodFrameTab[];
  tabsOrder?: string[];
  isEditor: boolean;
  framePath: string | null;
  fileName?: string;
  hidden?: boolean;
}

export function PodFrameTabButton({
  owner,
  spaceId,
  frameTabs,
  tabsOrder,
  isEditor,
  framePath,
  fileName,
  hidden,
}: PodFrameTabButtonProps) {
  const { removeFrameTab, isFrameTab } = usePodFrameTabs({
    owner,
    podId: spaceId,
    frameTabs,
    tabsOrder,
    isEditor,
  });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const draftTab = useMemo((): PodFrameTab | null => {
    if (!framePath) {
      return null;
    }
    return {
      path: framePath,
      title: podFrameTabBasename(fileName ?? framePath).slice(
        0,
        MAX_POD_FRAME_TAB_TITLE_LENGTH
      ),
      icon: DEFAULT_POD_FRAME_TAB_ICON,
    };
  }, [fileName, framePath]);

  if (hidden || !isEditor || !framePath || !draftTab) {
    return null;
  }

  const addedAsTab = isFrameTab(framePath);

  return (
    <>
      <Button
        icon={LayoutAlt02}
        variant={addedAsTab ? "highlight-ghost" : "ghost"}
        size="sm"
        tooltip={addedAsTab ? "Remove from Pod tabs" : "Add as Pod tab"}
        onClick={() => {
          if (addedAsTab) {
            void removeFrameTab(framePath, { fileName });
            return;
          }
          setIsCreateDialogOpen(true);
        }}
      />
      {isCreateDialogOpen && (
        <EditPodFrameTabDialog
          key={draftTab.path}
          owner={owner}
          podId={spaceId}
          frameTabs={frameTabs}
          tabsOrder={tabsOrder}
          isEditor={isEditor}
          tab={draftTab}
          mode="create"
          isOpen
          onClose={() => setIsCreateDialogOpen(false)}
        />
      )}
    </>
  );
}
