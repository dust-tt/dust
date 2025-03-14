import type { ExtensionWorkspaceType } from "@dust-tt/client";
import { Button, classNames, DustLogo, Page, Spinner } from "@dust-tt/sparkle";
import { useAuth } from "@extension/components/auth/AuthProvider";
import type { RouteChangeMesssage } from "@extension/lib/messages";
import type { StoredUser } from "@extension/lib/storage";
import { getPendingUpdate } from "@extension/lib/storage";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type ProtectedRouteProps = {
  children: ReactNode | ((props: ProtectedRouteChildrenProps) => ReactNode);
};

export type ProtectedRouteChildrenProps = {
  user: StoredUser;
  workspace: ExtensionWorkspaceType;
  handleLogout: () => void;
};

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const {
    isLoading,
    isAuthenticated,
    isUserSetup,
    user,
    workspace,
    handleLogout,
  } = useAuth();

  const navigate = useNavigate();
  const [isLatestVersion, setIsLatestVersion] = useState(true);

  useEffect(() => {
    const listener = (message: RouteChangeMesssage) => {
      const { type } = message;
      if (type === "EXT_ROUTE_CHANGE") {
        navigate({ pathname: message.pathname, search: message.search });
        return false;
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [navigate]);

  useEffect(() => {
    if (!isAuthenticated || !isUserSetup || !user || !workspace) {
      navigate("/login");
      return;
    }
  }, [navigate, isLoading, isAuthenticated, isUserSetup, user, workspace]);

  const checkIsLatestVersion = async () => {
    const pendingUpdate = await getPendingUpdate();
    if (!pendingUpdate) {
      return null;
    }
    if (pendingUpdate.version > chrome.runtime.getManifest().version) {
      setIsLatestVersion(false);
    }
  };

  useEffect(() => {
    void checkIsLatestVersion();

    chrome.storage.local.onChanged.addListener((changes) => {
      if (changes.pendingUpdate) {
        void checkIsLatestVersion();
      }
    });
  }, []);

  if (isLoading || !isAuthenticated || !isUserSetup || !user || !workspace) {
    return (
      <div
        className={classNames(
          "flex h-screen flex-col gap-2 p-4",
          "dark:bg-slate-950 dark:text-slate-50"
        )}
      >
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!isLatestVersion) {
    return (
      <div
        className={classNames(
          "flex h-screen flex-col gap-2 p-4",
          "dark:bg-slate-950 dark:text-slate-50"
        )}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
          <div className="flex flex-col items-center text-center space-y-4">
            <DustLogo className="h-6 w-24" />
            <Page.Header title="Update required" />
          </div>
          <Page.SectionHeader title="Panel closes after update. Click Dust icon in toolbar to return." />
          <Button
            label="Update now"
            onClick={async () => {
              chrome.runtime.reload();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "flex h-screen flex-col gap-2 px-4 overflow-y-auto",
        "dark:bg-slate-950 dark:text-slate-50"
      )}
    >
      {typeof children === "function"
        ? children({ user, workspace, handleLogout })
        : children}
    </div>
  );
};
