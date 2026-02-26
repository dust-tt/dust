import type { RegionType } from "@app/lib/api/regions/config";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import { getRegionDisplay } from "@app/lib/poke/regions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

interface PokeRegionDropdownProps {
  regionUrls?: Record<RegionType, string>;
}

export function PokeRegionDropdown({ regionUrls }: PokeRegionDropdownProps) {
  const { regionInfo, setRegionInfo } = useRegionContext();

  const currentRegion = regionInfo.name;

  const handleRegionChange = (region: RegionType) => {
    if (region === currentRegion || !regionUrls) {
      return;
    }

    setRegionInfo({ name: region, url: regionUrls[region] });
  };

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
