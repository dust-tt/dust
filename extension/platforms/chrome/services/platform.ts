import { ChromeStorageService } from "@app/platforms/chrome/services/storage";
import { BasePlatformService } from "@app/shared/services/platform";

export class ChromePlatformService extends BasePlatformService {
  constructor() {
    super("chrome", new ChromeStorageService());
  }
}
