import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types/space";
import { Chip } from "@dust-tt/sparkle";

interface SpaceChipsProps {
  spaces: SpaceType[];
  onRemoveSpace: (space: SpaceType) => void;
  disabled?: boolean;
}

export function SpaceChips({
  spaces,
  onRemoveSpace,
  disabled = false,
}: SpaceChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {spaces.map((space) => (
        <Chip
          size="xs"
          key={space.sId}
          label={getSpaceName(space)}
          icon={getSpaceIcon(space)}
          onRemove={
            space.kind !== "global" && !disabled
              ? () => onRemoveSpace(space)
              : undefined
          }
        />
      ))}
    </div>
  );
}
