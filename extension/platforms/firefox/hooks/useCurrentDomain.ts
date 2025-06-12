import { useEffect, useState } from "react";
import browser from "webextension-polyfill";

export const useCurrentUrlAndDomain = () => {
  const [currentDomain, setCurrentDomain] = useState<string>("");
  const [currentUrl, setCurrentUrl] = useState<string>("");

  useEffect(() => {
    // Function to update domain from tab.
    const updateDomainFromTab = (tab: any) => {
      if (tab?.url) {
        try {
          const url = new URL(tab.url);
          if (url.protocol.startsWith("http")) {
            setCurrentUrl(tab.url);
            setCurrentDomain(url.hostname);
          }
          if (url.protocol.startsWith("moz-extension")) {
            setCurrentUrl("");
            setCurrentDomain("moz-extension");
          }
        } catch (e) {
          console.error("Invalid URL:", e);
          setCurrentUrl("");
          setCurrentDomain("");
        }
      }
    };

    // Update domain when active tab changes.
    const handleTabActivated = (activeInfo: any) => {
      browser.tabs.get(activeInfo.tabId).then((tab) => {
        updateDomainFromTab(tab);
      });
    };

    // Update domain when tab URL changes.
    const handleTabUpdated = (
      tabId: number,
      changeInfo: any,
      tab: any
    ) => {
      if (changeInfo.status === "complete") {
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          if (tabs[0]?.id === tabId) {
            updateDomainFromTab(tab);
          }
        });
      }
    };

    // Get initial domain.
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]) {
        updateDomainFromTab(tabs[0]);
      }
    });

    // Add listeners.
    browser.tabs.onActivated.addListener(handleTabActivated);
    browser.tabs.onUpdated.addListener(handleTabUpdated);

    // Cleanup listeners.
    return () => {
      browser.tabs.onActivated.removeListener(handleTabActivated);
      browser.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, []);

  return { currentDomain, currentUrl };
};
