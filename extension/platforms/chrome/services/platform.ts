import { ChromeMcpService } from "@extension/platforms/chrome/services/mcp";
import { ChromeFirefoxAuthService } from "@extension/shared/services/browser_auth";
import { ChromeFirefoxCaptureService } from "@extension/shared/services/browser_capture";
import { ChromeFirefoxBrowserMessagingService } from "@extension/shared/services/browser_messaging";
import { ChromeFirefoxStorageService } from "@extension/shared/services/browser_storage";
import { PlatformService } from "@extension/shared/services/platform";

export interface PendingUpdate {
  detectedAt: number;
  version: string;
}

export class ChromePlatformService extends PlatformService {
  constructor() {
    const messaging = new ChromeFirefoxBrowserMessagingService();
    const captureService = new ChromeFirefoxCaptureService();
    const mcpService = new ChromeMcpService();
    mcpService.setCaptureService(captureService);

    super(
      "chrome",
      ChromeFirefoxAuthService,
      new ChromeFirefoxStorageService(),
      captureService,
      messaging,
      mcpService
    );
  }

  captureVisibleTab(): Promise<string> {
    return chrome.tabs.captureVisibleTab();
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
