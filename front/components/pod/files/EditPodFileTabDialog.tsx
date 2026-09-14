import { isCustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { getIcon } from "@app/components/resources/resources_icons";
import { usePodFileTabs } from "@app/hooks/usePodFileTabs";
import type { PodFileTab } from "@app/types/pod_file_tab";
import {
  DEFAULT_POD_FILE_TAB_ICON,
  MAX_POD_FILE_TAB_TITLE_LENGTH,
} from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionIcons,
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
import { useState } from "react";

interface EditPodFileTabDialogProps {
  owner: LightWorkspaceType;
  podId: string;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
  isEditor: boolean;
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
  tab,
  mode = "edit",
  isOpen,
  onClose,
}: EditPodFileTabDialogProps) {
  const isCreate = mode === "create";
  const { addFileTab, updateFileTab, removeFileTab } = usePodFileTabs({
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
                  disabled: !isEditor || isSaving,
                }
          }
          rightButtonProps={{
            label: isCreate ? "Add tab" : "Save",
            variant: "primary",
            onClick: () => void handleSave(),
            disabled: !isEditor || isSaving || !title.trim(),
            isLoading: isSaving,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
