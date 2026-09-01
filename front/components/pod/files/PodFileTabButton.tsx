import { EditPodFileTabDialog } from "@app/components/pod/files/EditPodFileTabDialog";
import { usePodFileTabs } from "@app/hooks/usePodFileTabs";
import type { PodFileTab } from "@app/types/pod_file_tab";
import {
  DEFAULT_POD_FILE_TAB_ICON,
  MAX_POD_FILE_TAB_TITLE_LENGTH,
  podFileTabBasename,
} from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, LayoutAlt02 } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface PodFileTabButtonProps {
  owner: LightWorkspaceType;
  spaceId: string;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
  isEditor: boolean;
  filePath: string | null;
  fileName?: string;
  hidden?: boolean;
}

export function PodFileTabButton({
  owner,
  spaceId,
  fileTabs,
  tabsOrder,
  isEditor,
  filePath,
  fileName,
  hidden,
}: PodFileTabButtonProps) {
  const { removeFileTab, isFileTab } = usePodFileTabs({
    owner,
    podId: spaceId,
    fileTabs,
    tabsOrder,
    isEditor,
  });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const draftTab = useMemo((): PodFileTab | null => {
    if (!filePath) {
      return null;
    }
    return {
      path: filePath,
      title: podFileTabBasename(fileName ?? filePath).slice(
        0,
        MAX_POD_FILE_TAB_TITLE_LENGTH
      ),
      icon: DEFAULT_POD_FILE_TAB_ICON,
    };
  }, [fileName, filePath]);

  if (hidden || !isEditor || !filePath || !draftTab) {
    return null;
  }

  const addedAsTab = isFileTab(filePath);

  return (
    <>
      <Button
        icon={LayoutAlt02}
        variant={addedAsTab ? "highlight-ghost" : "ghost"}
        size="sm"
        tooltip={addedAsTab ? "Remove from Pod tabs" : "Add as Pod tab"}
        onClick={() => {
          if (addedAsTab) {
            void removeFileTab(filePath, { fileName });
            return;
          }
          setIsCreateDialogOpen(true);
        }}
      />
      {isCreateDialogOpen && (
        <EditPodFileTabDialog
          key={draftTab.path}
          owner={owner}
          podId={spaceId}
          fileTabs={fileTabs}
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
