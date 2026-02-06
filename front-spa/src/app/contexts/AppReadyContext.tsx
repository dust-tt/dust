import { createContext, useCallback, useContext, useRef } from "react";

const AppReadyContext = createContext<() => void>(() => { });

function hideLoadingScreen() {
  const loading = document.getElementById("loading");
  if (!loading || loading.classList.contains("hidden")) {
    return;
  }

  loading.classList.add("hidden");
}

export function useAppReadyContext() {
  return useContext(AppReadyContext);
}

export function AppReadyProvider({ children }: { children: React.ReactNode }) {
  const loadingHiddenRef = useRef(false);

  const handleAppReady = useCallback(() => {
    if (loadingHiddenRef.current) {
      return;
    }
    loadingHiddenRef.current = true;
    hideLoadingScreen();
  }, []);

  return (
    <AppReadyContext.Provider value={handleAppReady}>
      {children}
    </AppReadyContext.Provider>
  );
}
