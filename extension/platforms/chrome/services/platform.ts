import { ChromeCaptureActions } from "@app/platforms/chrome/components/ChromeCaptureActions";
import { ChromeCorePlatformService } from "@app/platforms/chrome/services/core_platform";

// This class extends the ChromeCorePlatformService to include UI-specific functionality.
// It provides methods that return React components, such as getCaptureActionsComponent,
// which is used exclusively in the React UI context, not in the service worker.
export class ChromePlatformService extends ChromeCorePlatformService {
  getCaptureActionsComponent() {
    return ChromeCaptureActions;
  }

  getSendWithActionsLabel() {
    return "Add page text + Send";
  }
}
