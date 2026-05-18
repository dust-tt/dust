import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types/space";
import { Chip } from "@dust-tt/sparkle";

interface SpaceChipsProps {
  spaces: SpaceType[];
  onRemoveSpace: (space: SpaceType) => void;
  canRemoveSpace?: (space: SpaceType) => boolean;
}

export function SpaceChips({
  spaces,
  onRemoveSpace,
  canRemoveSpace,
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
            space.kind !== "global" && (canRemoveSpace?.(space) ?? true)
              ? () => onRemoveSpace(space)
              : undefined
          }
        />
      ))}
    </div>
  );
}
