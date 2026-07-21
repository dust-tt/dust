import { useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ChevronRight,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Planet,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface InputBarSpacesPickerProps {
  owner: LightWorkspaceType;
  disabled?: boolean;
}

// Shell: lets users see which Spaces are accessible from the input bar.
// Selection is local-only for now (not yet wired into message submission).
export function InputBarSpacesPicker({
  owner,
  disabled = false,
}: InputBarSpacesPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
    disabled: !isOpen,
  });

  const selectedSpaceIdsSet = useMemo(
    () => new Set(selectedSpaceIds),
    [selectedSpaceIds]
  );

  const label =
    selectedSpaceIds.length > 0
      ? `${selectedSpaceIds.length} Space${selectedSpaceIds.length > 1 ? "s" : ""}`
      : "Spaces";

  return (
    <DropdownMenuSub open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuSubTrigger
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(true);
        }}
      >
        <Planet className="h-5 w-5" />
        {label}
        <ChevronRight className="h-5 w-5" />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        <DropdownMenuLabel>Spaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSpacesLoading ? (
          <div className="flex items-center justify-center p-4">
            <Spinner size="xs" />
          </div>
        ) : spaces.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            No Spaces available
          </div>
        ) : (
          spaces.map((space) => {
            const checked = selectedSpaceIdsSet.has(space.sId);
            return (
              <DropdownMenuCheckboxItem
                key={space.sId}
                label={space.name}
                checked={checked}
                onCheckedChange={(nextChecked) => {
                  setSelectedSpaceIds((prev) =>
                    nextChecked
                      ? [...prev, space.sId]
                      : prev.filter((id) => id !== space.sId)
                  );
                }}
                onSelect={(event) => event.preventDefault()}
              />
            );
          })
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
