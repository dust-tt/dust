import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import type { RegionType } from "@app/lib/api/regions/config";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { getRegionDisplay } from "@app/lib/poke/regions";
import { isDevelopment } from "@app/types";

interface PokeRegionDropdownProps {
  currentRegion: RegionType;
  regionUrls?: Record<RegionType, string>;
}

export function PokeRegionDropdown({
  currentRegion,
  regionUrls,
}: PokeRegionDropdownProps) {
  const handleRegionChange = (region: RegionType) => {
    if (region === currentRegion) {
      return;
    }
    if (regionUrls) {
      const regionUrl = regionUrls[region];
      window.location.href = regionUrl + "/poke";
    }
  };

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
