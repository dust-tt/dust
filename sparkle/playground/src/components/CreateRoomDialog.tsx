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
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Folder,
  Input,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";

import { ROOT_FOLDER_ICON, ROOT_FOLDER_LABEL } from "../data/dataSources";
import { canContainItems } from "../data/fileMoves";
import { TreeDnd } from "./TreeDnd";

/**
 * A folder a Pod can be created in. The picker nests these the way the file
 * system does, so each one carries where it sits as well as its own name; the
 * path is for naming the choice once it is made, and for searching across it.
 */
export interface PodDestination {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  icon?: ComponentType<{ className?: string }>;
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

/**
 * The folders as a tree, the way Files shows them, so a destination is read in
 * place rather than off a list of paths. Searching falls back to a flat list of
 * matches: a tree pruned to its matching rows reads worse than the paths do.
 */
function DestinationTree({
  destinations,
  selectedId,
  onSelect,
  search,
}: {
  destinations: PodDestination[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  search: string;
}) {
  const childrenByParentId = useMemo(() => {
    const index = new Map<string | null, PodDestination[]>();
    for (const destination of destinations) {
      const siblings = index.get(destination.parentId);
      if (siblings) {
        siblings.push(destination);
      } else {
        index.set(destination.parentId, [destination]);
      }
    }
    return index;
  }, [destinations]);

  // The top level opens itself, the way the file system tree does.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set((childrenByParentId.get(null) ?? []).map((item) => item.id))
  );

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const searchLower = search.trim().toLowerCase();
  if (searchLower) {
    const matches = destinations.filter((item) =>
      item.path.toLowerCase().includes(searchLower)
    );
    if (matches.length === 0) {
      return (
        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
          No folder found
        </div>
      );
    }
    return (
      <TreeDnd variant="navigator">
        {matches.map((item) => (
          <TreeDnd.Item
            key={item.id}
            type="leaf"
            label={item.path}
            visual={item.icon ?? Folder}
            isSelected={selectedId === item.id}
            onItemClick={() => onSelect(item.id)}
          />
        ))}
      </TreeDnd>
    );
  }

  const renderDestination = (item: PodDestination) => {
    const children = childrenByParentId.get(item.id) ?? [];
    const shared = {
      label: item.name,
      visual: item.icon ?? Folder,
      isSelected: selectedId === item.id,
      onItemClick: () => onSelect(item.id),
    };

    if (children.length === 0) {
      return <TreeDnd.Item key={item.id} {...shared} type="leaf" />;
    }

    return (
      <TreeDnd.Item
        key={item.id}
        {...shared}
        type="node"
        collapsed={!expandedIds.has(item.id)}
        onChevronClick={() => toggleExpanded(item.id)}
        renderTreeItems={() => (
          <TreeDnd variant="navigator">
            {children.map(renderDestination)}
          </TreeDnd>
        )}
      />
    );
  };

  // The root names the branch the drives hang off, so it stays visible, but
  // it only holds drives: it is read, not picked.
  const isRootPickable = canContainItems(null);

  return (
    <TreeDnd variant="navigator">
      <TreeDnd.Item
        type="node"
        label={ROOT_FOLDER_LABEL}
        visual={ROOT_FOLDER_ICON}
        isSelected={isRootPickable && selectedId === null}
        onItemClick={isRootPickable ? () => onSelect(null) : undefined}
        className={
          isRootPickable ? undefined : "cursor-default hover:bg-hover/0"
        }
        collapsed={false}
        renderTreeItems={() => (
          <TreeDnd variant="navigator">
            {(childrenByParentId.get(null) ?? []).map(renderDestination)}
          </TreeDnd>
        )}
      />
    </TreeDnd>
  );
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
                    icon={destination?.icon ?? Folder}
                    className="self-start"
                    label={destination?.path ?? ROOT_FOLDER_LABEL}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-h-80 w-80 overflow-y-auto p-2"
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
                  <DestinationTree
                    destinations={destinations}
                    selectedId={destinationId}
                    onSelect={setDestinationId}
                    search={destinationSearch}
                  />
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
