import { ChromeAuthService } from "@extension/platforms/chrome/services/auth";
import { ChromeBrowserMessagingService } from "@extension/platforms/chrome/services/browser_messaging";
import { ChromeCaptureService } from "@extension/platforms/chrome/services/capture";
import { ChromeStorageService } from "@extension/platforms/chrome/services/storage";
import { CorePlatformService } from "@extension/shared/services/platform";

export interface PendingUpdate {
  detectedAt: number;
  version: string;
}

export class ChromeCorePlatformService extends CorePlatformService {
  readonly supportsMCP = false;

  constructor() {
    super(
      "chrome",
      ChromeAuthService,
      new ChromeStorageService(),
      new ChromeCaptureService(),
      new ChromeBrowserMessagingService()
    );
  }

  // Chrome specific helpers.

  // Store version for force update.
  async savePendingUpdate(
    pendingUpdate: PendingUpdate
  ): Promise<PendingUpdate> {
    await this.storage.set("pendingUpdate", pendingUpdate);

    return pendingUpdate;
  }

  async getPendingUpdate(): Promise<PendingUpdate | null> {
    const result = await this.storage.get<PendingUpdate>("pendingUpdate");

    return result ?? null;
  }
}
