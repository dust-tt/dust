import type { CellInfo } from "@app/types/cell";
import { ExcelAuthService } from "@extension/platforms/excel/services/auth";
import { ExcelStorageService } from "@extension/platforms/excel/services/storage";
import { PlatformService } from "@extension/shared/services/platform";

export class ExcelPlatformService extends PlatformService {
  constructor(cells: CellInfo[]) {
    const storage = new ExcelStorageService();

    super(
      "excel",
      ExcelAuthService,
      storage,
      cells,
      undefined, // No capture service for Excel.
      undefined, // No browser messaging service for Excel.
      undefined // No MCP service for Excel yet.
    );
  }

  captureVisibleTab(): Promise<string> {
    throw new Error("captureVisibleTab is not supported on this platform.");
  }
}
