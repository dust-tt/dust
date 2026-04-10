import { DEV_MODE_ACTIVE } from "@app/components/dev/devModeConstants";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { lazy, Suspense } from "react";

import AppRootLayout from "./AppRootLayout";

// Lazy-load the dev panel only when dev mode is active.
// The module is never fetched/parsed/executed when dev mode is off.
const DevFeatureFlagPanel = DEV_MODE_ACTIVE
  ? lazy(() =>
      // Dynamic import is necessary here: the dev panel must not be bundled
      // in the main chunk — it should only load when dev mode is active.
      import("@app/components/dev/DevFeatureFlagPanel").then((m) => ({
        default: m.DevFeatureFlagPanel,
      }))
    )
  : null;

interface AppAuthContextLayoutProps {
  children: React.ReactNode;
  authContext: AuthContextValue;
}

export function AppAuthContextLayout({
  children,
  authContext,
}: AppAuthContextLayoutProps) {
  return (
    <AuthContext.Provider value={authContext}>
      <AppRootLayout>{children}</AppRootLayout>
      {DevFeatureFlagPanel && (
        <Suspense fallback={null}>
          <DevFeatureFlagPanel serverFlags={authContext.featureFlags} />
        </Suspense>
      )}
    </AuthContext.Provider>
  );
}
