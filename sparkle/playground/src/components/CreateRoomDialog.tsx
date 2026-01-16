import {
  CheckBoxWithTextAndDescription,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import { type ChangeEvent, type KeyboardEvent, useState } from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";

interface CreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onNext: (roomName: string, isPublic: boolean) => void;
}

export function CreateRoomDialog({
  isOpen,
  onClose,
  onNext,
}: CreateRoomDialogProps) {
  const [roomName, setRoomName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    const trimmedName = roomName.trim();
    if (!trimmedName) {
      setError("Room name is required");
      return;
    }
    setError(null);
    onNext(trimmedName, isPublic);
  };

  const handleClose = () => {
    setRoomName("");
    setIsPublic(true);
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open: boolean) => !open && handleClose()}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Create a new room</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="s-flex s-flex-col s-gap-3">
            <Input
              label="Room name"
              placeholder="Enter room name"
              value={roomName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setRoomName(e.currentTarget.value);
                setError(null);
              }}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  handleNext();
                }
              }}
              isError={!!error}
              message={error}
              messageStatus={error ? "error" : "default"}
              autoFocus
            />
            <CheckBoxWithTextAndDescription
              id="is-public-checkbox"
              text="is public"
              description="Anyone in the workspace can find and join the room."
              checked={isPublic}
              onCheckedChange={(checked: CheckedState) => {
                setIsPublic(checked === true);
              }}
            />
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Create",
            variant: "primary",
            onClick: handleNext,
            disabled: !roomName.trim(),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
