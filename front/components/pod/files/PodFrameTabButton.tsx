import { usePodFrameTabs } from "@app/hooks/usePodFrameTabs";
import type { PodFrameTab } from "@app/types/pod_frame_tab";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, LayoutAlt02 } from "@dust-tt/sparkle";

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
  const { toggleFrameTab, isFrameTab } = usePodFrameTabs({
    owner,
    podId: spaceId,
    frameTabs,
    tabsOrder,
    isEditor,
  });

  if (hidden || !isEditor || !framePath) {
    return null;
  }

  const addedAsTab = isFrameTab(framePath);

  return (
    <Button
      icon={LayoutAlt02}
      variant={addedAsTab ? "highlight-ghost" : "ghost"}
      size="sm"
      tooltip={addedAsTab ? "Remove from Pod tabs" : "Add as Pod tab"}
      onClick={() =>
        void toggleFrameTab(framePath, {
          fileName,
        })
      }
    />
  );
}
