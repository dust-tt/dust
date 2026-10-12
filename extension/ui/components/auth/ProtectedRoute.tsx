import { UserLocaleSync } from "@app/components/app/UserLocaleSync";
import { CommandPaletteProvider } from "@app/components/command_palette/CommandPaletteContext";
import { cn, Spinner } from "@dust-tt/sparkle";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import type { RouteChangeMesssage } from "@extension/shared/messages";
import { useExtensionAuth } from "@extension/ui/components/auth/AuthProvider";
import { ExtensionCommandPalette } from "@extension/ui/components/command_palette/ExtensionCommandPalette";
import { ExtensionClientSideMCPServerProvider } from "@extension/ui/components/conversation/ExtensionClientSideMCPServerProvider";
import { ExtensionInputBarProvider } from "@extension/ui/components/conversation/ExtensionInputBarProvider";
import { ExtensionQuickActionsProvider } from "@extension/ui/components/quick_actions/ExtensionQuickActionsProvider";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

/**
 * @cc [owner:Nils-Fedrigo,label:product] spinner-waits-for-user-locale
 * Once the user, workspace and subscription are loaded, the spinner MUST stay visible until
 * `UserLocaleSync` first reports ready, so the extension is never shown in a locale it is about to
 * switch away from. Later locale changes MUST NOT bring the spinner back.
 */
export const ProtectedRoute = () => {
  const platform = usePlatform();
  const {
    isLoading,
    isAuthenticated,
    isUserSetup,
    user,
    workspace,
    subscription,
  } = useExtensionAuth();

  const navigate = useNavigate();
  const [isLocaleReady, setIsLocaleReady] = useState(false);
  const handleLocaleReady = useCallback(() => setIsLocaleReady(true), []);

  useEffect(() => {
    const cleanup = platform.messaging?.addMessageListener(
      (message: RouteChangeMesssage) => {
        const { type } = message;
        if (type === "EXT_ROUTE_CHANGE") {
          navigate({ pathname: message.pathname, search: message.search });
        }
      }
    );

    return () => {
      cleanup?.();
    };
  }, [navigate]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (!isAuthenticated || !isUserSetup || !user || !workspace) {
      navigate("/login");
      return;
    }
  }, [navigate, isLoading, isAuthenticated, isUserSetup, user, workspace]);

  const spinner = (
    <div
      className={cn(
        "flex h-screen items-center justify-center",
        "bg-background text-foreground"
      )}
    >
      <Spinner />
    </div>
  );

  // Wait for subscription too — shared front components (model picker) read
  // plan access from AuthContext, which is only provided once subscription
  // has been fetched from auth-context.
  if (
    isLoading ||
    !isAuthenticated ||
    !isUserSetup ||
    !user ||
    !workspace ||
    !subscription
  ) {
    return spinner;
  }

  return (
    <>
      <UserLocaleSync onReady={handleLocaleReady} />
      {isLocaleReady ? (
        <div
          className={cn(
            "flex h-screen flex-col gap-2 overflow-y-auto",
            "bg-background text-foreground"
          )}
        >
          <CommandPaletteProvider>
            <ExtensionQuickActionsProvider owner={workspace}>
              <ExtensionClientSideMCPServerProvider>
                <ExtensionInputBarProvider workspace={workspace}>
                  <Outlet />
                  <ExtensionCommandPalette owner={workspace} user={user} />
                </ExtensionInputBarProvider>
              </ExtensionClientSideMCPServerProvider>
            </ExtensionQuickActionsProvider>
          </CommandPaletteProvider>
        </div>
      ) : (
        spinner
      )}
    </>
  );
};
