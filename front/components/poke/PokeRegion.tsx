import { Button } from "@dust-tt/sparkle";

import type { RegionType } from "@app/lib/api/regions/config";
import { getRegionDisplay } from "@app/lib/poke/regions";

interface PokeRegionProps {
  currentRegion: RegionType;
}

export function PokeRegion({ currentRegion }: PokeRegionProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      label={getRegionDisplay(currentRegion)}
      disabled
    />
  );
}
