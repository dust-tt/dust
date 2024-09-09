import React, { useState } from "react";

export const SidebarContext = React.createContext<{
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
}>({
  sidebarOpen: false,
  setSidebarOpen: (value) => {
    throw new Error("SidebarContext not initialized: " + value);
  },
});

export const SidebarProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      {children}
    </SidebarContext.Provider>
  );
};
