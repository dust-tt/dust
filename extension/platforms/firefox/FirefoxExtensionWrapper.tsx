import { Button, cn, DustLogo, Page } from "@dust-tt/sparkle";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { Trans, useLingui } from "@lingui/react/macro";
import { compare } from "compare-versions";
import React from "react";
import type { FirefoxPlatformService } from "./services/platform";

export const FirefoxExtensionWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { t } = useLingui();
  const platform = usePlatform() as FirefoxPlatformService;
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
          "bg-background text-foreground"
        )}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <DustLogo width={256} height={64} />
            <Page.Header title={t`New version ready`} />
            <Page.P>
              <Trans>Install the latest version to keep using Dust.</Trans>
              <br />
              <Trans>Relaunch from toolbar.</Trans>
            </Page.P>
            <Button
              label={t`Update now`}
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
