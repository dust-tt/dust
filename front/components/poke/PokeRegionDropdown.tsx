import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import { usePokeRegionContextSafe } from "@app/components/poke/PokeRegionContext";
import type { RegionType } from "@app/lib/api/regions/config";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { getRegionDisplay } from "@app/lib/poke/regions";
import { isDevelopment } from "@app/types";

interface PokeRegionDropdownProps {
  currentRegion?: RegionType;
  regionUrls?: Record<RegionType, string>;
}

export function PokeRegionDropdown({
  currentRegion: propRegion,
  regionUrls,
}: PokeRegionDropdownProps) {
  // Use safe context hook to avoid errors in Next.js mode.
  const regionContext = usePokeRegionContextSafe();

  // Use context if available (SPA mode), otherwise use prop (Next.js mode).
  const currentRegion = regionContext?.currentRegion ?? propRegion;

  const handleRegionChange = (region: RegionType) => {
    if (region === currentRegion) {
      return;
    }

    // SPA mode: use context to switch region without page reload.
    if (regionContext) {
      regionContext.setRegion(region);
      return;
    }

    // Next.js mode: redirect to the other region's URL.
    if (regionUrls) {
      const regionUrl = regionUrls[region];
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = regionUrl + "/poke";
    }
  };

  if (!currentRegion) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          isSelect
          label={getRegionDisplay(currentRegion)}
          disabled={isDevelopment()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {SUPPORTED_REGIONS.map((region) => (
          <DropdownMenuItem
            key={region}
            onClick={() => handleRegionChange(region)}
            disabled={region === currentRegion}
          >
            {getRegionDisplay(region)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
