import { useCellContext } from "@app/lib/auth/CellContext";
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
  const { cellInfo, setCellInfo } = useCellContext();

  const handleCellChange = (cell: CellInfo) => {
    if (!cellInfo || cell.name === cellInfo.name) {
      return;
    }

    setCellInfo(cell);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          isSelect
          label={getCellDisplay(cellInfo)}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {(cells ?? []).map((cell) => (
          <DropdownMenuItem
            key={cell.name}
            onClick={() => handleCellChange(cell)}
            disabled={cell.name === cellInfo?.name}
          >
            {getCellDisplay(cell)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
