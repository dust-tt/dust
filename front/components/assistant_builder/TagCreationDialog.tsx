import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useCreateTag } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import type { TagType } from "@app/types/tag";

export const MAX_TAG_LENGTH = 100;

export const TagCreationDialog = ({
  owner,
  isOpen,
  setIsOpen,
  onTagCreated,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onTagCreated: (tag: TagType) => void;
}) => {
  const [name, setName] = useState("");
  const { createTag } = useCreateTag({ owner });

  useEffect(() => {
    if (isOpen) {
      setName("");
    }
  }, [isOpen]);

  const handleCreateTag = async () => {
    const tag = await createTag(name);
    if (tag) {
      onTagCreated(tag);
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add tag</DialogTitle>
          <DialogDescription>
            Create a new tag for your assistant
          </DialogDescription>
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
