import React, { createContext, useContext, useEffect, useState } from "react";
import browser from "webextension-polyfill";

export const PortContext = createContext<browser.Runtime.Port | null>(null);

export const PortProvider = ({ children }: { children: React.ReactNode }) => {
  const [port, setPort] = useState<browser.Runtime.Port | null>(null);

  useEffect(() => {
    const port = browser.runtime.connect({ name: "sidepanel-connection" });
    setPort(port);

    return () => {
      port.disconnect();
    };
  }, []);

  return <PortContext.Provider value={port}>{children}</PortContext.Provider>;
};

export const usePort = () => {
  const port = useContext(PortContext);
  if (!port) {
    throw new Error("usePort must be used within a PortProvider");
  }
  return port;
};
