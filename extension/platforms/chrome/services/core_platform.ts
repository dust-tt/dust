import { ChromeAuthService } from "@app/platforms/chrome/services/auth";
import { ChromeBrowserMessagingService } from "@app/platforms/chrome/services/browser_messaging";
import { ChromeCaptureService } from "@app/platforms/chrome/services/capture";
import { ChromeStorageService } from "@app/platforms/chrome/services/storage";
import { CorePlatformService } from "@app/shared/services/platform";

export interface PendingUpdate {
  detectedAt: number;
  version: string;
}

export class ChromeCorePlatformService extends CorePlatformService {
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
