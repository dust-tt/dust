import { useUpdateConversationTitle } from "@app/hooks/useUpdateConversationTitle";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

type EditConversationTitleDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  conversationId: string;
  currentTitle: string;
};

export const EditConversationTitleDialog = ({
  isOpen,
  onClose,
  owner,
  conversationId,
  currentTitle,
}: EditConversationTitleDialogProps) => {
  const { t } = useLingui();
  const [title, setTitle] = useState<string>(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateTitle = useUpdateConversationTitle({
    owner,
    conversationId,
  });

  useEffect(() => {
    if (isOpen) {
      setTitle(currentTitle);
      // Focus the input after the dialog has opened
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isOpen, currentTitle]);

  const editTitle = useCallback(async () => {
    await updateTitle(title);
  }, [title, updateTitle]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Edit conversation title</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Input
            ref={inputRef}
            placeholder={t`Enter new title...`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void editTitle();
                onClose();
              }
            }}
          />
        </DialogContainer>
        <DialogFooter
          rightButtonProps={{
            label: t`Save`,
            variant: "primary",
            onClick: editTitle,
          }}
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
