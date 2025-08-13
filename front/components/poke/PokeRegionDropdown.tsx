import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import type { RegionType } from "@app/lib/api/regions/config";
import {
  config as multiRegionsConfig,
  SUPPORTED_REGIONS,
} from "@app/lib/api/regions/config";
import { getRegionDisplay } from "@app/lib/poke/regions";
import { isDevelopment } from "@app/types";

interface PokeRegionDropdownProps {
  currentRegion: RegionType;
}

export function PokeRegionDropdown({ currentRegion }: PokeRegionDropdownProps) {
  const handleRegionChange = (region: RegionType) => {
    if (region === currentRegion) {
      return;
    }
    const regionUrl = multiRegionsConfig.getRegionUrl(region);
    window.location.href = regionUrl + "/poke";
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
