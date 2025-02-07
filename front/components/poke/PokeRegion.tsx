import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import type { RegionType } from "@app/lib/api/regions/config";
import { getRegionDisplay } from "@app/lib/poke/regions";

interface PokeRegionProps {
  currentRegion: RegionType;
}

export function PokeRegion({ currentRegion }: PokeRegionProps) {
  return (
    <PokeButton variant="outline" size="sm" disabled>
      {getRegionDisplay(currentRegion)}
    </PokeButton>
  );
}
