import { useCreateTag } from "@app/lib/swr/tags";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

export const MAX_TAG_LENGTH = 100;

interface TagCreationDialogProps {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onTagCreated: (tag: TagType) => void;
}

export const TagCreationDialog = ({
  owner,
  isOpen,
  setIsOpen,
  onTagCreated,
}: TagCreationDialogProps) => {
  const { t } = useLingui();
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
          <DialogTitle>
            <Trans>Add tag</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Create a new tag for your assistant</Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="space-y-2">
            <Label htmlFor="name">
              <Trans>Name</Trans>
            </Label>
            <div className="flex space-x-2">
              <div className="flex-grow">
                <Input
                  maxLength={MAX_TAG_LENGTH}
                  id="name"
                  placeholder={t`Tag name`}
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
            label: t`Cancel`,
            variant: "ghost",
          }}
          rightButtonProps={{
            label: t`Save`,
            variant: "primary",
            onClick: handleCreateTag,
            disabled: name.length === 0,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
