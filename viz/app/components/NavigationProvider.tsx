import * as React from "react";
import { useNavigationWarning } from "@viz/app/components/NavigationWarningDialog";

/**
 * NavigationProvider - Best Effort Security for External Link Navigation
 * 
 * This provider intercepts window.open calls to warn users before navigating to external links.
 * It's a best-effort approach to improve security by:
 * - Allowing trusted domains to navigate without confirmation
 * - Showing a warning dialog for external/untrusted domains
 * - Displaying URL details to help users make informed decisions
 * 
 * Note: This is not a complete security solution and can be bypassed by:
 * - Direct DOM manipulation
 * - Other navigation methods (location.href, etc.)
 * - Malicious code that overrides our window.open wrapper
 * 
 * This should be used as part of a broader security strategy.
 */

interface NavigationProviderProps {
  children: React.ReactNode;
  trustedDomains: string[];
}

export function NavigationProvider({
  children,
  trustedDomains,
}: NavigationProviderProps) {
  const { showWarning, DialogComponent } = useNavigationWarning();

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const originalOpen = window.open;

    window.open = function (url, target, features) {
      if (!url) {
        return originalOpen.call(window, url, target, features);
      }

      try {
        const urlObj = new URL(url, window.location.href);

        // Allow trusted domains.
        if (trustedDomains.some((domain) => urlObj.hostname.endsWith(domain))) {
          return originalOpen.call(window, url, target, features);
        }

        // Show custom dialog for external links.
        showWarning(urlObj.href).then((confirmed) => {
          if (confirmed) {
            originalOpen.call(window, url, target, features);
          }
        });

        return null;
      } catch (err) {
        // Invalid URL, let it fail naturally.
        return originalOpen.call(window, url, target, features);
      }
    };

    // Cleanup function to restore original window.open.
    return () => {
      window.open = originalOpen;
    };
  }, [showWarning, trustedDomains]);

  return (
    <>
      {children}
      <DialogComponent />
    </>
  );
}
