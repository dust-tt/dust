import { useRouter } from "next/router";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface NavigationLoadingContextType {
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  startNavigation: () => void;
  takeOverLoading: () => void;
  releaseLoading: () => void;
}

interface NavigationLoadingProviderProps {
  children: React.ReactNode;
}

const NavigationLoadingContext = React.createContext<
  NavigationLoadingContextType | undefined
>(undefined);

export function NavigationLoadingProvider({
  children,
}: NavigationLoadingProviderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isTakenOverRef = useRef(false);
  const router = useRouter();

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const startNavigation = useCallback(() => {
    setIsLoading(true);
    isTakenOverRef.current = false;
  }, []);

  const takeOverLoading = useCallback(() => {
    isTakenOverRef.current = true;
    setIsLoading(true);
  }, []);

  const releaseLoading = useCallback(() => {
    isTakenOverRef.current = false;
    setIsLoading(false);
  }, []);

  // Clear loading state when route change is complete (unless taken over by a page)
  useEffect(() => {
    const handleRouteChangeComplete = () => {
      if (!isTakenOverRef.current) {
        setIsLoading(false);
      }
    };

    const handleRouteChangeError = () => {
      isTakenOverRef.current = false;
      setIsLoading(false);
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
        isLoading,
        setLoading,
        startNavigation,
        takeOverLoading,
        releaseLoading,
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
