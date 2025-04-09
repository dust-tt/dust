import { FrontCaptureActions } from "@app/platforms/front/components/FrontCaptureActions";
import { FrontAuthService } from "@app/platforms/front/services/auth";
import { FrontCaptureService } from "@app/platforms/front/services/capture";
import { FrontMcpService } from "@app/platforms/front/services/mcp";
import { FrontStorageService } from "@app/platforms/front/services/storage";
import type { CaptureActionsProps } from "@app/shared/services/platform";
import { PlatformService } from "@app/shared/services/platform";
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
      new FrontCaptureService(frontContext),
      undefined, // No browser messaging service for Front.
      mcpService
    );
  }

  getCaptureActionsComponent(): ComponentType<CaptureActionsProps> {
    return FrontCaptureActions;
  }

  getSendWithActionsLabel(): string {
    return "Include conversation + Send";
  }
}
