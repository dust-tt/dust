import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";

import AppRootLayout from "./AppRootLayout";

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
    </AuthContext.Provider>
  );
}
