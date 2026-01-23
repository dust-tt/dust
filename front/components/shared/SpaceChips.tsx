import { Chip } from "@dust-tt/sparkle";

import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

interface SpaceChipsProps {
  spaces: SpaceType[];
  onRemoveSpace: (space: SpaceType) => void;
}

export function SpaceChips({ spaces, onRemoveSpace }: SpaceChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {spaces.map((space) => (
        <Chip
          size="xs"
          key={space.sId}
          label={getSpaceName(space)}
          icon={getSpaceIcon(space)}
          onRemove={
            space.kind !== "global" ? () => onRemoveSpace(space) : undefined
          }
        />
      ))}
    </div>
  );
}
