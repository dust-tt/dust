import type { LightWorkspaceType } from "@app/types/user";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import type { ExtensionAppMessage } from "@extension/shared/messages";
import { SavePageToPodDialog } from "@extension/ui/components/quick_actions/SavePageToPodDialog";
import { useSavePageToPod } from "@extension/ui/hooks/useSavePageToPod";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface ExtensionQuickActionsContextValue {
  isSavingPageToPod: boolean;
  openSavePageToPodDialog: () => void;
  savePageToPod: (podId: string) => Promise<boolean>;
}

const ExtensionQuickActionsContext =
  createContext<ExtensionQuickActionsContextValue | null>(null);

export function useExtensionQuickActions() {
  return useContext(ExtensionQuickActionsContext);
}

interface ExtensionQuickActionsProviderProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export function ExtensionQuickActionsProvider({
  owner,
  children,
}: ExtensionQuickActionsProviderProps) {
  const platform = usePlatform();
  const { isSaving, savePageToPod } = useSavePageToPod({ owner });
  const [showSaveToPodDialog, setShowSaveToPodDialog] = useState(false);

  const openSavePageToPodDialog = useCallback(() => {
    setShowSaveToPodDialog(true);
  }, []);

  useEffect(() => {
    const cleanup = platform.messaging?.addMessageListener(
      (message: ExtensionAppMessage) => {
        if (message.type !== "EXT_SAVE_TO_POD") {
          return;
        }
        openSavePageToPodDialog();
      }
    );

    return () => {
      cleanup?.();
    };
  }, [openSavePageToPodDialog, platform.messaging]);

  const contextValue = useMemo(
    () => ({
      isSavingPageToPod: isSaving,
      openSavePageToPodDialog,
      savePageToPod,
    }),
    [isSaving, openSavePageToPodDialog, savePageToPod]
  );

  return (
    <ExtensionQuickActionsContext.Provider value={contextValue}>
      <SavePageToPodDialog
        owner={owner}
        isOpen={showSaveToPodDialog}
        onClose={() => setShowSaveToPodDialog(false)}
        onSelect={savePageToPod}
        isSaving={isSaving}
      />
      {children}
    </ExtensionQuickActionsContext.Provider>
  );
}
