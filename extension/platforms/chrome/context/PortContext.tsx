import { createContext, useEffect, useState } from "react";

export const PortContext = createContext<chrome.runtime.Port | null>(null);

export const PortProvider = ({ children }: { children: React.ReactNode }) => {
  const [port, setPort] = useState<chrome.runtime.Port | null>(null);

  useEffect(() => {
    // Use a different port name when embedded in a content-script iframe (e.g.
    // Arc) vs. running as a native side panel (e.g. Chrome). The content
    // script sets ?embedded=1 on the iframe src so we can tell the two apart
    // reliably (window.self !== window.top is not sufficient because Chrome
    // also embeds the native side panel in a frame internally).
    // This is necessary to avoid conflicts between the two contexts since they
    // both use the same background script and could otherwise accidentally
    // receive each other's messages.
    const isEmbedded =
      new URLSearchParams(window.location.search).get("embedded") === "1";
    const portName = isEmbedded
      ? "content-script-connection"
      : "sidepanel-connection";

    console.log(`Connecting to ${portName}`);
    const port = chrome.runtime.connect({ name: portName });

    // When running as a native side panel, listen for a close request from
    // the background (triggered when the user clicks the toolbar button again).
    if (!isEmbedded) {
      port.onMessage.addListener((message) => {
        if (message.type === "CLOSE_SIDE_PANEL") {
          window.close();
        }
      });
    }

    setPort(port);

    return () => {
      port.disconnect();
    };
  }, []);

  return <PortContext.Provider value={port}>{children}</PortContext.Provider>;
};
