import { FrontCaptureActions } from "@app/platforms/front/components/FrontCaptureActions";
import { FrontAuthService } from "@app/platforms/front/services/auth";
import { FrontCaptureService } from "@app/platforms/front/services/capture";
import { FrontStorageService } from "@app/platforms/front/services/storage";
import type { CaptureActionsProps } from "@app/shared/services/platform";
import { PlatformService } from "@app/shared/services/platform";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import type { ComponentType } from "react";

export class FrontPlatformService extends PlatformService {
  constructor(frontContext: WebViewContext) {
    super(
      "front",
      FrontAuthService,
      new FrontStorageService(),
      new FrontCaptureService(frontContext)
    );
  }

  getCaptureActionsComponent(): ComponentType<CaptureActionsProps> {
    return FrontCaptureActions;
  }

  getSendWithActionsLabel(): string {
    return "Include conversation + Send";
  }
}
