import { useEffect, useState } from "react";

interface UseLoginRedirectParams {
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface UseLoginRedirectResult {
  isRedirecting: boolean;
}

/**
 * Hook that handles login redirect.
 * Redirects to login when user is not authenticated.
 */
export function useLoginRedirect({
  isLoading,
  isAuthenticated,
}: UseLoginRedirectParams): UseLoginRedirectResult {
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
