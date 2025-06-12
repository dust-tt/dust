import { FirefoxCaptureActions } from "@app/platforms/firefox/components/FirefoxCaptureActions";
import { FirefoxCorePlatformService } from "@app/platforms/firefox/services/core_platform";

// This class extends the FirefoxCorePlatformService to include UI-specific functionality.
// It provides methods that return React components, such as getCaptureActionsComponent,
// which is used exclusively in the React UI context, not in the service worker.
export class FirefoxPlatformService extends FirefoxCorePlatformService {
  getCaptureActionsComponent() {
    return FirefoxCaptureActions;
  }

  getSendWithActionsLabel() {
    return "Add page text + Send";
  }
}
