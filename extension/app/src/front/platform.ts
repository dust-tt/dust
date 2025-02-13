import { FrontAttachButtons } from "@extension/front/components/AttachButtons";
import { FrontAuth } from "@extension/front/services/auth";
import { FrontStorageService } from "@extension/front/storage";
import type { PlatformService } from "@extension/shared/services/platform";

export const frontPlatform: PlatformService = {
  platform: "front",
  auth: new FrontAuth(),
  storage: new FrontStorageService(),
  components: {
    AttachButtons: FrontAttachButtons,
  },
};
