import React, { useCallback, useState } from "react";

export const SidebarContext = React.createContext<{
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
  toggleSidebar: () => void;
}>({
  sidebarOpen: false,
  setSidebarOpen: (value) => {
    throw new Error("SidebarContext not initialized: " + value);
  },
  toggleSidebar: () => {
    throw new Error("SidebarContext not initialized");
  },
});

export const SidebarProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <SidebarContext.Provider
      value={{ sidebarOpen, setSidebarOpen, toggleSidebar }}
    >
      {children}
    </SidebarContext.Provider>
  );
};
