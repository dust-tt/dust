import { useRouter } from "next/router";
import React, { useCallback, useContext, useEffect, useState } from "react";

interface NavigationLoadingContextType {
  isNavigating: boolean;
  showNavigationLoader: () => void;
}

interface NavigationLoadingProviderProps {
  children: React.ReactNode;
}

const NavigationLoadingContext = React.createContext<
  NavigationLoadingContextType | undefined
>(undefined);

// In our app, it sometimes takes a very long time to navigate to another page (e.g. go to the spaces tab).
// Users often don't know if they fail to click or we are loading the page. To avoid confusion,
// you can show a loading spinner when navigation takes longer with this context. The loading spinner has an opacity animation,
// it starts with opacity: 0 and then after 0.5s we set opacity: 1, so we can show the spinner only when the
// navigation takes a long time.
export function NavigationLoadingProvider({
  children,
}: NavigationLoadingProviderProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  const showNavigationLoader = useCallback(() => {
    setIsNavigating(true);
  }, []);

  // Clear loading state when route change is complete
  useEffect(() => {
    const handleRouteChangeComplete = () => {
      setIsNavigating(false);
    };

    const handleRouteChangeError = () => {
      setIsNavigating(false);
    };

    router.events.on("routeChangeComplete", handleRouteChangeComplete);
    router.events.on("routeChangeError", handleRouteChangeError);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChangeComplete);
      router.events.off("routeChangeError", handleRouteChangeError);
    };
  }, [router.events]);

  return (
    <NavigationLoadingContext.Provider
      value={{
        isNavigating,
        showNavigationLoader,
      }}
    >
      {children}
    </NavigationLoadingContext.Provider>
  );
}

export function useNavigationLoading() {
  const context = useContext(NavigationLoadingContext);
  if (!context) {
    throw new Error(
      "useNavigationLoading must be used within a NavigationLoadingProvider"
    );
  }
  return context;
}
