import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import type { RegionType } from "@app/lib/api/regions/config";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { useRegionContextSafe } from "@app/lib/auth/RegionContext";
import { getRegionDisplay } from "@app/lib/poke/regions";

interface PokeRegionDropdownProps {
  currentRegion?: RegionType;
  regionUrls?: Record<RegionType, string>;
}

export function PokeRegionDropdown({
  currentRegion: propRegion,
  regionUrls,
}: PokeRegionDropdownProps) {
  // Use safe context hook to avoid errors in Next.js mode.
  const regionContext = useRegionContextSafe();

  // Use context if available (SPA mode), otherwise use prop (Next.js mode).
  const currentRegion = regionContext?.regionInfo?.name ?? propRegion;

  const handleRegionChange = (region: RegionType) => {
    if (region === currentRegion || !regionUrls) {
      return;
    }

    // SPA mode: use context to switch region without page reload.
    if (regionContext) {
      regionContext.setRegionInfo({ name: region, url: regionUrls[region] });
      return;
    }

    // Next.js mode: redirect to the other region's URL.
    const regionUrl = regionUrls[region];
    window.location.assign(`${regionUrl}/poke`);
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
