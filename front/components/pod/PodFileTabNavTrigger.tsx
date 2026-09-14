import { EditPodFileTabDialog } from "@app/components/pod/files/EditPodFileTabDialog";
import { usePodMenu } from "@app/components/pod/PodMenu";
import { getIcon } from "@app/components/resources/resources_icons";
import { usePodFileTabs } from "@app/hooks/usePodFileTabs";
import type { PodFileTab } from "@app/types/pod_file_tab";
import { makePodFileTabValue } from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit04,
  NavTabPillTrigger,
  XClose,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface PodFileTabNavTriggerProps {
  owner: LightWorkspaceType;
  podId: string;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
  isEditor: boolean;
  tab: PodFileTab;
  className?: string;
}

export function PodFileTabNavTrigger({
  owner,
  podId,
  fileTabs,
  tabsOrder,
  isEditor,
  tab,
  className,
}: PodFileTabNavTriggerProps) {
  const { removeFileTab } = usePodFileTabs({
    owner,
    podId,
    fileTabs,
    tabsOrder,
    isEditor,
  });
  const {
    isMenuOpen,
    menuTriggerPosition,
    handleRightClick,
    handleMenuPhaseChange,
  } = usePodMenu();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  return (
    <>
      <NavTabPillTrigger
        value={makePodFileTabValue(tab.path)}
        icon={getIcon(tab.icon)}
        className={className}
        onContextMenu={isEditor ? handleRightClick : undefined}
      >
        {tab.title}
      </NavTabPillTrigger>
      {isEditor && menuTriggerPosition && (
        <DropdownMenu
          modal={false}
          open={isMenuOpen}
          onOpenChange={(open) =>
            handleMenuPhaseChange(open ? "open" : "closing")
          }
        >
          <DropdownMenuTrigger asChild>
            <div
              style={{
                position: "fixed",
                left: menuTriggerPosition.x,
                top: menuTriggerPosition.y,
                width: 0,
                height: 0,
                pointerEvents: "none",
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            onCloseAutoFocus={() => handleMenuPhaseChange("closed")}
            onFocusOutside={(e) => e.preventDefault()}
          >
            <DropdownMenuItem
              label="Edit"
              icon={Edit04}
              onClick={() => setIsEditDialogOpen(true)}
            />
            <DropdownMenuItem
              label="Remove"
              icon={XClose}
              onClick={() =>
                void removeFileTab(tab.path, { fileName: tab.title })
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {isEditDialogOpen && (
        <EditPodFileTabDialog
          key={tab.path}
          owner={owner}
          podId={podId}
          fileTabs={fileTabs}
          tabsOrder={tabsOrder}
          isEditor={isEditor}
          tab={tab}
          mode="edit"
          isOpen
          onClose={() => setIsEditDialogOpen(false)}
        />
      )}
    </>
  );
}
