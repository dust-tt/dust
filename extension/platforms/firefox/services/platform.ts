import { FirefoxMcpService } from "@extension/platforms/firefox/services/mcp";
import { ChromeFirefoxAuthService } from "@extension/shared/services/browser_auth";
import { ChromeFirefoxCaptureService } from "@extension/shared/services/browser_capture";
import { ChromeFirefoxBrowserMessagingService } from "@extension/shared/services/browser_messaging";
import { ChromeFirefoxStorageService } from "@extension/shared/services/browser_storage";
import { PlatformService } from "@extension/shared/services/platform";
import browser from "webextension-polyfill";

export interface PendingUpdate {
  detectedAt: number;
  version: string;
}

export class FirefoxPlatformService extends PlatformService {
  constructor() {
    const messaging = new ChromeFirefoxBrowserMessagingService();
    const captureService = new ChromeFirefoxCaptureService();
    const mcpService = new FirefoxMcpService();
    mcpService.setCaptureService(captureService);

    super(
      "firefox",
      ChromeFirefoxAuthService,
      new ChromeFirefoxStorageService(),
      captureService,
      messaging,
      mcpService
    );
  }

  captureVisibleTab(): Promise<string> {
    return browser.tabs.captureVisibleTab();
  }

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
