import { useUpdateTag } from "@app/lib/swr/tags";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { MAX_TAG_LENGTH } from "./TagCreationDialog";

interface EditTagDialogProps {
  owner: WorkspaceType;
  tag: TagType;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const EditTagDialog = ({
  owner,
  tag,
  isOpen,
  setIsOpen,
}: EditTagDialogProps) => {
  const { t } = useLingui();
  const [name, setName] = useState(() => tag.name);
  const { updateTag } = useUpdateTag({ owner, tagId: tag.sId });

  const handleUpdateTag = async () => {
    await updateTag({ name, kind: tag.kind });
    if (tag) {
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>Edit tag</Trans>
          </DialogTitle>
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
                      void handleUpdateTag();
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
            onClick: handleUpdateTag,
            disabled: name.length === 0,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
