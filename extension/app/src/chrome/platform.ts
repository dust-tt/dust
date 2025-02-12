import { ChromeAuth } from "@extension/chrome/services/auth";
import type { PlatformService } from "@extension/shared/services/platform";

export const chromePlatform: PlatformService = {
  platform: "chrome",
  auth: new ChromeAuth(),
};
