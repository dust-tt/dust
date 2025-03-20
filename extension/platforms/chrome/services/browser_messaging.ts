import type { AttachSelectionMessage } from "@app/platforms/chrome/messages";
import type { BrowserMessagingService } from "@app/shared/services/platform";

export class ChromeBrowserMessagingService implements BrowserMessagingService {
  addMessageListener(
    listener: (message: AttachSelectionMessage) => void | Promise<void>
  ) {
    chrome.runtime.onMessage.addListener(listener);
    return () => this.removeMessageListener(listener);
  }

  removeMessageListener(
    listener: (message: AttachSelectionMessage) => void | Promise<void>
  ) {
    chrome.runtime.onMessage.removeListener(listener);
  }
}
