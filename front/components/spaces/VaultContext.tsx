import React from "react";

export const VaultContext = React.createContext<
  | {
      setShowVaultCreationModal: (show: boolean) => void;
    }
  | undefined
>(undefined);

export const useVaultContext = () => {
  const context = React.useContext(VaultContext);
  if (!context) {
    throw new Error("useVaultContext must be used within a VaultContext");
  }
  return context;
};
