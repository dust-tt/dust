import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useUpdateTag } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import type { TagType } from "@app/types/tag";

import { MAX_TAG_LENGTH } from "./TagCreationDialog";

export const EditTagDialog = ({
  owner,
  tag,
  isOpen,
  setIsOpen,
}: {
  owner: WorkspaceType;
  tag: TagType;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}) => {
  const [name, setName] = useState(() => tag.name);
  const { updateTag } = useUpdateTag({ owner, tagId: tag.sId });

  const handleCreateTag = async () => {
    await updateTag({ name });
    if (tag) {
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Edit tag</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <div className="flex space-x-2">
              <div className="flex-grow">
                <Input
                  maxLength={MAX_TAG_LENGTH}
                  id="name"
                  placeholder="Tag name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.length > 0) {
                      void handleCreateTag();
                    }
                  }}
                  autoFocus
                />
              </div>
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: handleCreateTag,
            disabled: name.length === 0,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
