import { FrontAuthService } from "@extension/platforms/front/services/auth";
import { FrontMcpService } from "@extension/platforms/front/services/mcp";
import { FrontStorageService } from "@extension/platforms/front/services/storage";
import type { CaptureActionsProps } from "@extension/shared/services/platform";
import { PlatformService } from "@extension/shared/services/platform";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import type { ComponentType } from "react";

export class FrontPlatformService extends PlatformService {
  readonly supportsMCP = true;

  constructor(frontContext: WebViewContext) {
    const storage = new FrontStorageService();
    const mcpService = new FrontMcpService();

    // Pass the Front context to the MCP service.
    mcpService.setFrontContext(frontContext);

    super(
      "front",
      FrontAuthService,
      storage,
      undefined, // No capture service for Front.
      undefined, // No browser messaging service for Front.
      mcpService
    );
  }

  getCaptureActionsComponent(): ComponentType<CaptureActionsProps> | null {
    return null;
  }

  getSendWithActionsLabel(): string {
    return "Include conversation + Send";
  }
}
