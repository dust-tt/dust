import type { AttachSelectionMessage } from "@app/platforms/firefox/messages";
import type { BrowserMessagingService } from "@app/shared/services/platform";
import browser from "webextension-polyfill";

export class FirefoxBrowserMessagingService implements BrowserMessagingService {
  addMessageListener(
    listener: (message: AttachSelectionMessage) => void | Promise<void>
  ) {
    browser.runtime.onMessage.addListener(listener);
    return () => this.removeMessageListener(listener);
  }

  removeMessageListener(
    listener: (message: AttachSelectionMessage) => void | Promise<void>
  ) {
    browser.runtime.onMessage.removeListener(listener);
  }

  sendMessage<T = any, R = any>(
    message: T,
    callback?: (response: R) => void
  ): void | Promise<R> {
    if (!callback) {
      return browser.runtime.sendMessage(message);
    }

    return new Promise((resolve, reject) => {
      try {
        browser.runtime.sendMessage(message).then((response: R | undefined) => {
          if (response === undefined) {
            reject(new Error("No response received"));
          } else {
            callback(response);
            resolve(response);
          }
        }).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }
}
