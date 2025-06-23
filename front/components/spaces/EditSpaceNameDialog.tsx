import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

import type { SpaceType } from "@app/types";

interface EditSpaceNameDialogProps {
  space: SpaceType;
  onEditName: (newName: string) => void;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
}

export function EditSpaceNameDialog({
  space,
  onEditName,
  isOpen,
  isSaving,
  onClose,
}: EditSpaceNameDialogProps) {
  const [editingSpaceName, setEditingSpaceName] = useState<string>(space.name);

  const handleClose = () => {
    // Reset the space name.
    setEditingSpaceName(space.name);
    onClose();
  };

  const handleSave = () => {
    if (editingSpaceName.trim()) {
      onEditName(editingSpaceName.trim());
    }
  };

  // Initialize the editing name when dialog opens.
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setEditingSpaceName(space.name);
    } else {
      handleClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename the space</DialogTitle>
        </DialogHeader>
        {isSaving ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer>
              <Input
                placeholder="Space's name"
                value={editingSpaceName}
                name="editingSpaceName"
                onChange={(e) => setEditingSpaceName(e.target.value)}
              />
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: handleClose,
              }}
              rightButtonProps={{
                label: "Confirm",
                onClick: handleSave,
                disabled: !editingSpaceName.trim(),
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
