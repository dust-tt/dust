import { useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
  Planet,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface InputBarSpacesPickerProps {
  owner: LightWorkspaceType;
  disabled?: boolean;
  // When true, start fetching spaces even before this picker's own
  // dropdown opens — lets a parent menu (e.g. the "+" menu) kick off the
  // fetch as soon as IT opens, instead of waterfalling on this picker's
  // own click.
  prefetch?: boolean;
}

// Shell: lets users see which Spaces are accessible from the input bar.
// Selection is local-only for now (not yet wired into message submission).
export function InputBarSpacesPicker({
  owner,
  disabled = false,
  prefetch = false,
}: InputBarSpacesPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
    disabled: !isOpen && !prefetch,
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
        label={label}
        icon={
          <Icon size="xs" visual={Planet} className="text-muted-foreground" />
        }
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(true);
        }}
      />
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
