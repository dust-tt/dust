import {
  Button,
  CloudArrowLeftRightIcon,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";

import type { LabsTranscriptsConfigurationType } from "@app/types";

interface GongConnectionProps {
  transcriptsConfiguration: LabsTranscriptsConfigurationType | null;
  setIsDeleteProviderDialogOpened: (isOpen: boolean) => void;
  isGongConnectorConnected: boolean;
  onConnect: () => void;
}

export function GongConnection({
  transcriptsConfiguration,
  setIsDeleteProviderDialogOpened,
  isGongConnectorConnected,
  onConnect,
}: GongConnectionProps) {
  return (
    <Page.Layout direction="vertical">
      {isGongConnectorConnected ? (
        <>
          {transcriptsConfiguration ? (
            <Page.Layout direction="horizontal">
              <Button
                label="Gong connected"
                size="sm"
                icon={CloudArrowLeftRightIcon}
                disabled={true}
              />
              <Button
                label="Disconnect"
                icon={XMarkIcon}
                size="sm"
                variant="outline"
                onClick={() => setIsDeleteProviderDialogOpened(true)}
              />
            </Page.Layout>
          ) : (
            <>
              <Page.P>The Gong connection is active on your workspace.</Page.P>
              <div>
                <Button
                  label="Process your Gong transcripts"
                  size="sm"
                  icon={CloudArrowLeftRightIcon}
                  onClick={onConnect}
                />
              </div>
            </>
          )}
        </>
      ) : (
        <Page.P>
          Please connect to Gong in the Connection Admin section so Dust can
          access your meeting transcripts before processing them.
        </Page.P>
      )}
    </Page.Layout>
  );
}
