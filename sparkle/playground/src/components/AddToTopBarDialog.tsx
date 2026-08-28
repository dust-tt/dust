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
  Label,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Separator,
} from "@dust-tt/sparkle";
import { useState, type ComponentType } from "react";

interface AddToTopBarDialogProps {
  isOpen: boolean;
  fileName: string;
  defaultIcon: ComponentType;
  onClose: () => void;
  onAdd: (iconName?: string) => void;
}

function isActionIconName(name: string): name is keyof typeof ActionIcons {
  return name in ActionIcons;
}

export function AddToTopBarDialog({
  isOpen,
  fileName,
  defaultIcon,
  onClose,
  onAdd,
}: AddToTopBarDialogProps) {
  const [selectedIconName, setSelectedIconName] = useState("");
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  const selectedIcon = isActionIconName(selectedIconName)
    ? ActionIcons[selectedIconName]
    : defaultIcon;

  const handleClose = () => {
    setSelectedIconName("");
    setIsIconPickerOpen(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add "{fileName}" to the Pod's top bar?</DialogTitle>
        </DialogHeader>
        <DialogContainer className="flex flex-col gap-4">
          This change will be visible to all members of the Pod.
          <Separator />
          <div className="flex items-center gap-3">
            <Label htmlFor="add-topbar-icon">Icon</Label>
            <PopoverRoot
              modal={false}
              open={isIconPickerOpen}
              onOpenChange={setIsIconPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  id="add-topbar-icon"
                  size="xs"
                  variant="outline"
                  icon={selectedIcon}
                  tooltip="Change icon"
                />
              </PopoverTrigger>
              <PopoverContent
                className="w-fit p-0"
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                <IconPicker
                  icons={ActionIcons}
                  selectedIcon={selectedIconName}
                  onIconSelect={(iconName: string) => {
                    setSelectedIconName(iconName);
                    setIsIconPickerOpen(false);
                  }}
                />
              </PopoverContent>
            </PopoverRoot>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Add",
            variant: "highlight",
            onClick: () => {
              onAdd(selectedIconName || undefined);
              handleClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
