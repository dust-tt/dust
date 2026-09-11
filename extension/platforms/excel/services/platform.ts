import type { CellInfo } from "@app/types/cell";
import { ExcelAuthService } from "@extension/platforms/excel/services/auth";
import { ExcelMcpService } from "@extension/platforms/excel/services/mcp";
import { LocalStorageService } from "@extension/shared/services/local_storage";
import { PlatformService } from "@extension/shared/services/platform";

export class ExcelPlatformService extends PlatformService {
  constructor(cells: CellInfo[]) {
    const storage = new LocalStorageService();
    const mcpService = new ExcelMcpService();

    super(
      "excel",
      ExcelAuthService,
      storage,
      cells,
      undefined, // No capture service for Excel.
      undefined, // No browser messaging service for Excel.
      mcpService
    );
  }

  captureVisibleTab(): Promise<string> {
    throw new Error("captureVisibleTab is not supported on this platform.");
  }
}
