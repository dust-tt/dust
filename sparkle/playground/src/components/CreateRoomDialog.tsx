import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Create a new room</DialogTitle>
        </DialogHeader>
        <DialogContainer className="s-space-y-6">
          <Input
            label="Room name"
            placeholder="Enter room name"
            value={roomName}
            onChange={(e) => {
              setRoomName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleNext();
              }
            }}
            isError={!!error}
            message={error}
            messageStatus={error ? "error" : "default"}
            autoFocus
          />
          <div className="s-flex s-items-start s-justify-between s-gap-4">
            <div className="s-flex s-flex-col">
              <div className="s-text-sm s-font-semibold s-text-foreground">
                Opened to everyone
              </div>
              <div className="s-text-sm s-text-muted-foreground">
                Anyone in the workspace can find and join the room.
              </div>
            </div>
            <SliderToggle
              size="xs"
              selected={isPublic}
              onClick={() => setIsPublic((prev) => !prev)}
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
