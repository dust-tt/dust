import { useRegionContext } from "@app/lib/auth/RegionContext";
import { getCellDisplay } from "@app/lib/poke/cells";
import type { CellInfo } from "@app/types/cell";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

interface PokeCellDropdownProps {
  cells?: CellInfo[];
}

export function PokeCellDropdown({ cells }: PokeCellDropdownProps) {
  const { regionInfo, setRegionInfo } = useRegionContext();

  const currentCell =
    cells?.find((cell) => cell.url === regionInfo.url) ??
    cells?.find((cell) => cell.region === regionInfo.name);

  const handleCellChange = (cell: CellInfo) => {
    if (!currentCell || cell.name === currentCell.name) {
      return;
    }

    setRegionInfo({ name: cell.region, url: cell.url });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          isSelect
          label={currentCell ? getCellDisplay(currentCell) : regionInfo.name}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {(cells ?? []).map((cell) => (
          <DropdownMenuItem
            key={cell.name}
            onClick={() => handleCellChange(cell)}
            disabled={cell.name === currentCell?.name}
          >
            {getCellDisplay(cell)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
