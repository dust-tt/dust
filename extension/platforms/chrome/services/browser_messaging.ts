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

  sendMessage<T = any, R = any>(
    message: T,
    callback?: (response: R) => void
  ): void | Promise<R> {
    if (!callback) {
      return chrome.runtime.sendMessage(message);
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response: R | undefined) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response === undefined) {
            reject(new Error("No response received"));
          } else {
            callback(response);
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}
