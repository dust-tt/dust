import { routerEvents } from "@spa/lib/platform";
import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

/**
 * Root layout for all routes.
 * Emits router events (routeChangeComplete, hashChangeComplete) exactly once
 * per navigation, rather than once per component using useAppRouter.
 */
export function RootRouterLayout() {
  const location = useLocation();

  const previousLocationRef = useRef<{
    pathname: string;
    search: string;
    hash: string;
  } | null>(null);

  // Emit routeChangeComplete when pathname or search changes
  useEffect(() => {
    const currentLocation = {
      pathname: location.pathname,
      search: location.search,
      hash: window.location.hash,
    };

    const previousLocation = previousLocationRef.current;

    // Skip initial mount - don't emit event on first render
    if (previousLocation !== null) {
      // Only emit if pathname or search changed (not hash - that's handled by hashchange listener)
      if (
        previousLocation.pathname !== currentLocation.pathname ||
        previousLocation.search !== currentLocation.search
      ) {
        const fullUrl = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
        queueMicrotask(() => {
          routerEvents.emit("routeChangeComplete", fullUrl);
        });
      }
    }

    previousLocationRef.current = currentLocation;
  }, [location]);

  // Listen for hash changes (React Router doesn't track these)
  useEffect(() => {
    const handleHashChange = () => {
      const fullUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      routerEvents.emit("hashChangeComplete", fullUrl);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return <Outlet />;
}
