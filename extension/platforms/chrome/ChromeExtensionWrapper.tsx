import { Button, cn, DustLogo, Page } from "@dust-tt/sparkle";
import type { ChromePlatformService } from "@extension/platforms/chrome/services/platform";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { compare } from "compare-versions";
import React from "react";

export const ChromeExtensionWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const platform = usePlatform() as ChromePlatformService;
  const [isLatestVersion, setIsLatestVersion] = React.useState(true);

  const checkIsLatestVersion = async () => {
    const pendingUpdate = await platform.getPendingUpdate();
    if (!pendingUpdate) {
      return null;
    }
    const currentVersion = chrome.runtime.getManifest().version;
    if (compare(pendingUpdate.version, currentVersion, ">")) {
      setIsLatestVersion(false);
    }
  };

  React.useEffect(() => {
    void checkIsLatestVersion();

    const unsub = platform.storage.onChanged((changes) => {
      if (changes.pendingUpdate) {
        void checkIsLatestVersion();
      }
    });

    return () => unsub();
  }, []);

  if (!isLatestVersion) {
    return (
      <div
        className={cn(
          "flex h-screen flex-col gap-2 p-4",
          "bg-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <DustLogo width={256} height={64} />
            <Page.Header title="New version ready" />
            <Page.P>
              Install the latest version to keep using Dust. <br />
              Relaunch from toolbar.
            </Page.P>
            <Button
              label="Update now"
              onClick={async () => {
                chrome.runtime.reload();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return children;
};
