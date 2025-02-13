import { ChromeAttachButtons } from "@extension/chrome/components/AttachButtons";
import { ChromeAuth } from "@extension/chrome/services/auth";
import { ChromeCaptureService } from "@extension/chrome/services/capture";
import { ChromeStorageService } from "@extension/chrome/storage";
import type { PlatformService } from "@extension/shared/services/platform";

export const chromePlatform: PlatformService = {
  platform: "chrome",
  auth: new ChromeAuth(),
  storage: new ChromeStorageService(),
  components: {
    AttachButtons: ChromeAttachButtons,
  },
  capture: new ChromeCaptureService(),
};
