import { createContext, useEffect, useState } from "react";

export const PortContext = createContext<chrome.runtime.Port | null>(null);

export const PortProvider = ({ children }: { children: React.ReactNode }) => {
  const [port, setPort] = useState<chrome.runtime.Port | null>(null);

  useEffect(() => {
    console.log("Connecting to sidepanel");
    const port = chrome.runtime.connect({ name: "sidepanel-connection" });

    setPort(port);

    return () => {
      port.disconnect();
    };
  }, []);

  return <PortContext.Provider value={port}>{children}</PortContext.Provider>;
};
