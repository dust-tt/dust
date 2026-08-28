import type { CellInfo, CellType } from "@app/types/cell";
import { isCellType, SUPPORTED_CELLS } from "@app/types/cell";
import { isDevelopment } from "@app/types/shared/env";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { EnvironmentConfig } from "@app/types/shared/utils/config";

// Ensure we have a CellInfo entry for EVERY CellType by iterating SUPPORTED_CELLS.
const CELLS: Record<CellType, CellInfo> = Object.fromEntries(
  SUPPORTED_CELLS.map((cell) => {
    switch (cell) {
      // US Global
      case "cell-00000":
        return [
          cell,
          {
            name: cell,
            region: "us-central1",
            url: EnvironmentConfig.getEnvVariable("DUST_US_URL"),
          },
        ];
      // EU Global
      case "cell-00001":
        return [
          cell,
          {
            name: cell,
            region: "europe-west1",
            url: EnvironmentConfig.getEnvVariable("DUST_EU_URL"),
          },
        ];
      default:
        // This ensures that if a new CellType is added, TypeScript will error until handled.
        assertNever(cell);
    }
  })
) satisfies Record<CellType, CellInfo>;

const MAIN_CELL: CellType = "cell-00000";

export const config = {
  getCurrentCell: (): CellInfo => {
    const cell = EnvironmentConfig.getEnvVariable("CELL");
    if (!isCellType(cell)) {
      throw new Error(`Invalid cell: ${cell}`);
    }
    return CELLS[cell];
  },
  getLookupApiSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("REGION_RESOLVER_SECRET");
  },
  getCellUrl(cell: CellType): string {
    if (isDevelopment()) {
      return "http://localhost:3000";
    }

    switch (cell) {
      case "cell-00000":
        return EnvironmentConfig.getEnvVariable("DUST_EU_URL");
      case "cell-00001":
        return EnvironmentConfig.getEnvVariable("DUST_US_URL");
      default:
        assertNever(cell);
    }
  },
  isMainCell(): boolean {
    return this.getCurrentCell().name === MAIN_CELL;
  },
  getOtherCells(): CellInfo[] {
    const currentCell = this.getCurrentCell();
    return Object.values(CELLS).filter(
      (cell) => cell.name !== currentCell.name
    );
  },
  getDustCellSyncEnabled: (): boolean => {
    return (
      EnvironmentConfig.getEnvVariable("CELL") !== MAIN_CELL || isDevelopment()
    );
  },
  getDustCellSyncMasterUrl: (): string => {
    return CELLS[MAIN_CELL].url;
  },
};
