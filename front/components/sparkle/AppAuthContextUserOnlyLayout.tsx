import type { AuthContextUserOnlyValue } from "@app/lib/auth/AuthContext";
import { AuthContextUserOnly } from "@app/lib/auth/AuthContext";

import AppRootLayout from "./AppRootLayout";

interface AppAuthContextUserOnlyLayoutProps {
  children: React.ReactNode;
  authContext: AuthContextUserOnlyValue;
}

export function AppAuthContextUserOnlyLayout({
  children,
  authContext,
}: AppAuthContextUserOnlyLayoutProps) {
  return (
    <AuthContextUserOnly.Provider value={authContext}>
      <AppRootLayout>{children}</AppRootLayout>
    </AuthContextUserOnly.Provider>
  );
}
