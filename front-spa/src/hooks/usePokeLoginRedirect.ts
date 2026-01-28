import { useEffect, useState } from "react";

interface UsePokeLoginRedirectParams {
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface UsePokeLoginRedirectResult {
  isRedirecting: boolean;
}

/**
 * Hook that handles login redirect for Poke pages.
 * Redirects to login when user is not authenticated.
 */
export function usePokeLoginRedirect({
  isLoading,
  isAuthenticated,
}: UsePokeLoginRedirectParams): UsePokeLoginRedirectResult {
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setIsRedirecting(true);
      const baseUrl = import.meta.env.VITE_DUST_CLIENT_FACING_URL ?? "";
      window.location.href = `${baseUrl}/api/workos/login?returnTo=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`;
    }
  }, [isLoading, isAuthenticated]);

  return { isRedirecting };
}
