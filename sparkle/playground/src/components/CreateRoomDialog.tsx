import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Folder,
  Input,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

/** A folder a Pod can be created in, named by its full path. */
export interface PodDestination {
  id: string | null;
  label: string;
}

interface CreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Folders the Pod may be created in; omit to hide the destination picker. */
  destinations?: PodDestination[];
  /** Pre-selects a folder, e.g. the one open in Files. */
  defaultDestinationId?: string | null;
  onNext: (
    roomName: string,
    isPublic: boolean,
    destinationId?: string | null
  ) => void;
}

export function CreateRoomDialog({
  isOpen,
  onClose,
  destinations,
  defaultDestinationId = null,
  onNext,
}: CreateRoomDialogProps) {
  const [roomName, setRoomName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(
    defaultDestinationId
  );
  const [destinationSearch, setDestinationSearch] = useState("");

  // The dialog stays mounted, so each opening re-reads the folder it was
  // asked to start from.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setDestinationId(defaultDestinationId);
      setDestinationSearch("");
    }
  }

  const destination = destinations?.find((item) => item.id === destinationId);
  const searchLower = destinationSearch.trim().toLowerCase();
  const visibleDestinations = (destinations ?? []).filter((item) =>
    item.label.toLowerCase().includes(searchLower)
  );

  const handleNext = () => {
    const trimmedName = roomName.trim();
    if (!trimmedName) {
      setError("Pod name is required");
      return;
    }
    setError(null);
    onNext(trimmedName, isPublic, destinationId);
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
        <DialogContainer className="space-y-6">
          <Input
            label="Pod name"
            placeholder="Enter the pod name"
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
          {destinations && destinations.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-sm font-semibold text-foreground">
                Location
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    isSelect
                    icon={Folder}
                    className="self-start"
                    label={destination?.label ?? "Files"}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-h-80 w-80"
                  dropdownHeaders={
                    <DropdownMenuSearchbar
                      autoFocus
                      name="pod-destination-search"
                      placeholder="Search folders"
                      value={destinationSearch}
                      onChange={setDestinationSearch}
                    />
                  }
                >
                  {visibleDestinations.length > 0 ? (
                    visibleDestinations.map((item) => (
                      <DropdownMenuItem
                        key={item.id ?? "root"}
                        label={item.label}
                        icon={Folder}
                        onClick={() => setDestinationId(item.id)}
                      />
                    ))
                  ) : (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No folder found
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <div className="text-sm font-semibold text-foreground">
                Opened to everyone
              </div>
              <div className="text-sm text-muted-foreground">
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
