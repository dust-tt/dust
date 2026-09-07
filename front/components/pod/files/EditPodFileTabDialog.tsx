import { isCustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { getIcon } from "@app/components/resources/resources_icons";
import { usePodFileTabs } from "@app/hooks/usePodFileTabs";
import type { PodFileTab, PodNavVisibility } from "@app/types/pod_file_tab";
import {
  buildPodNavItemsBeforeSettings,
  DEFAULT_POD_FILE_TAB_ICON,
  DEFAULT_POD_NAV_VISIBILITY,
  MAX_POD_FILE_TAB_TITLE_LENGTH,
} from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionIcons,
  ArrowLeft,
  ArrowRight,
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconPicker,
  Input,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface EditPodFileTabDialogProps {
  owner: LightWorkspaceType;
  podId: string;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
  isEditor: boolean;
  navVisibility?: PodNavVisibility;
  tab: PodFileTab;
  mode?: "create" | "edit";
  isOpen: boolean;
  onClose: () => void;
}

export function EditPodFileTabDialog({
  owner,
  podId,
  fileTabs,
  tabsOrder,
  isEditor,
  navVisibility = DEFAULT_POD_NAV_VISIBILITY,
  tab,
  mode = "edit",
  isOpen,
  onClose,
}: EditPodFileTabDialogProps) {
  const isCreate = mode === "create";
  const {
    addFileTab,
    updateFileTab,
    removeFileTab,
    moveFileTab,
    tabsOrder: navOrder,
  } = usePodFileTabs({
    owner,
    podId,
    fileTabs,
    tabsOrder,
    isEditor,
  });

  const [title, setTitle] = useState(tab.title);
  const [icon, setIcon] = useState(tab.icon);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const navItems = useMemo(
    () => buildPodNavItemsBeforeSettings(fileTabs, navOrder, navVisibility),
    [fileTabs, navVisibility, navOrder]
  );
  const tabIndex = navItems.findIndex(
    (item) => item.kind === "file" && item.tab.path === tab.path
  );
  const canMoveLeft = !isCreate && isEditor && tabIndex > 0;
  const canMoveRight =
    !isCreate && isEditor && tabIndex >= 0 && tabIndex < navItems.length - 1;

  const selectedIcon = isCustomResourceIconType(icon)
    ? icon
    : DEFAULT_POD_FILE_TAB_ICON;
  const IconComponent = getIcon(selectedIcon);

  const handleSave = async () => {
    if (!isEditor) {
      return;
    }
    setIsSaving(true);
    const nextTitle = title.trim() || tab.title;
    const ok = isCreate
      ? await addFileTab(tab.path, {
          title: nextTitle,
          icon: selectedIcon,
          skipConfirm: true,
        })
      : await updateFileTab(tab.path, {
          title: nextTitle,
          icon: selectedIcon,
        });
    setIsSaving(false);
    if (ok) {
      onClose();
    }
  };

  const handleRemove = async () => {
    if (!isEditor || isCreate) {
      return;
    }
    setIsSaving(true);
    const ok = await removeFileTab(tab.path, {
      fileName: tab.title,
      skipConfirm: true,
    });
    setIsSaving(false);
    if (ok) {
      onClose();
    }
  };

  const handleMove = async (direction: "left" | "right") => {
    if (!isEditor || isCreate) {
      return;
    }
    setIsMoving(true);
    await moveFileTab(tab.path, direction, navVisibility);
    setIsMoving(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setIsIconPickerOpen(false);
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? "Add file tab" : "Edit file tab"}
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex items-center gap-2">
            <PopoverRoot
              modal
              open={isIconPickerOpen}
              onOpenChange={(open) => {
                if (isEditor) {
                  setIsIconPickerOpen(open);
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  icon={IconComponent}
                  disabled={!isEditor}
                  tooltip="Change icon"
                />
              </PopoverTrigger>
              <PopoverContent
                className="w-fit p-0"
                mountPortalContainer={
                  typeof document !== "undefined" ? document.body : undefined
                }
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <IconPicker
                  icons={ActionIcons}
                  selectedIcon={selectedIcon}
                  onIconSelect={(iconName: string) => {
                    if (isCustomResourceIconType(iconName)) {
                      setIcon(iconName);
                    }
                    setIsIconPickerOpen(false);
                  }}
                />
              </PopoverContent>
            </PopoverRoot>
            <Input
              id="file-tab-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_POD_FILE_TAB_TITLE_LENGTH}
              disabled={!isEditor}
              placeholder="Tab title"
              containerClassName="flex-1"
            />
            {(canMoveLeft || canMoveRight) && (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  icon={ArrowLeft}
                  tooltip="Move left"
                  disabled={!canMoveLeft || isMoving || isSaving}
                  onClick={() => void handleMove("left")}
                />
                <Button
                  variant="ghost"
                  icon={ArrowRight}
                  tooltip="Move right"
                  disabled={!canMoveRight || isMoving || isSaving}
                  onClick={() => void handleMove("right")}
                />
              </div>
            )}
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={
            isCreate
              ? undefined
              : {
                  label: "Remove tab",
                  variant: "warning",
                  onClick: () => void handleRemove(),
                  disabled: !isEditor || isSaving || isMoving,
                }
          }
          rightButtonProps={{
            label: isCreate ? "Add tab" : "Save",
            variant: "primary",
            onClick: () => void handleSave(),
            disabled: !isEditor || isSaving || isMoving || !title.trim(),
            isLoading: isSaving,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
