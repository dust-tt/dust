import { FirefoxAuthService } from "@app/platforms/firefox/services/auth";
import { FirefoxBrowserMessagingService } from "@app/platforms/firefox/services/browser_messaging";
import { FirefoxCaptureService } from "@app/platforms/firefox/services/capture";
import { FirefoxStorageService } from "@app/platforms/firefox/services/storage";
import { CorePlatformService } from "@app/shared/services/platform";

export interface PendingUpdate {
  detectedAt: number;
  version: string;
}

export class FirefoxCorePlatformService extends CorePlatformService {
  readonly supportsMCP = false;

  constructor() {
    super(
      "firefox",
      FirefoxAuthService,
      new FirefoxStorageService(),
      new FirefoxCaptureService(),
      new FirefoxBrowserMessagingService()
    );
  }

  // Firefox specific helpers.

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
