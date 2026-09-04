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
            // Local poke/dev talks to the single local front-api, even when
            // production cell public URLs are configured in the environment.
            url: isDevelopment()
              ? "http://localhost:3000"
              : (EnvironmentConfig.getOptionalEnvVariable("DUST_US_URL") ??
                "https://dust.tt"),
          },
        ];
      // EU Global
      case "cell-00001":
        return [
          cell,
          {
            name: cell,
            region: "europe-west1",
            url: isDevelopment()
              ? "http://localhost:3000"
              : (EnvironmentConfig.getOptionalEnvVariable("DUST_EU_URL") ??
                "https://eu.dust.tt"),
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
  getCellInfo(cell: CellType): CellInfo {
    return CELLS[cell];
  },
  getCellUrl(cell: CellType): string {
    return this.getCellInfo(cell).url;
  },
  getAllCells(): CellInfo[] {
    return SUPPORTED_CELLS.map((cell) => this.getCellInfo(cell));
  },
  isMainCell(): boolean {
    return this.getCurrentCell().name === MAIN_CELL;
  },
  getOtherCells(): CellInfo[] {
    const currentCell = this.getCurrentCell();
    return this.getAllCells().filter((cell) => cell.name !== currentCell.name);
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
