import { useEffect, useState } from "react";

export const useCurrentUrlAndDomain = () => {
  const [currentDomain, setCurrentDomain] = useState<string>("");
  const [currentUrl, setCurrentUrl] = useState<string>("");

  useEffect(() => {
    // Function to update domain from tab.
    const updateDomainFromTab = (tab: chrome.tabs.Tab) => {
      if (tab?.url) {
        try {
          const url = new URL(tab.url);
          if (url.protocol.startsWith("http")) {
            setCurrentUrl(tab.url);
            setCurrentDomain(url.hostname);
          }
          if (url.protocol.startsWith("chrome")) {
            setCurrentUrl("");
            setCurrentDomain("chrome");
          }
        } catch (e) {
          console.error("Invalid URL:", e);
          setCurrentUrl("");
          setCurrentDomain("");
        }
      }
    };

    // Update domain when active tab changes.
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        updateDomainFromTab(tab);
      });
    };

    // Update domain when tab URL changes.
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (changeInfo.status === "complete") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id === tabId) {
            updateDomainFromTab(tab);
          }
        });
      }
    };

    // Get initial domain.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        updateDomainFromTab(tabs[0]);
      }
    });

    // Add listeners.
    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    // Cleanup listeners.
    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, []);

  return { currentDomain, currentUrl };
};
