import {
  Button,
  CloudArrowLeftRightIcon,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";

import type { LabsTranscriptsConfigurationType } from "@app/types";

interface GoogleDriveConnectionProps {
  transcriptsConfiguration: LabsTranscriptsConfigurationType | null;
  setIsDeleteProviderDialogOpened: (isOpen: boolean) => void;
  onConnect: () => void;
}

export function GoogleDriveConnection({
  transcriptsConfiguration,
  setIsDeleteProviderDialogOpened,
  onConnect,
}: GoogleDriveConnectionProps) {
  return (
    <Page.Layout direction="vertical">
      {transcriptsConfiguration ? (
        <Page.Layout direction="horizontal">
          <Button
            label="Google connected"
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
          <Page.P>
            Connect to Google Drive so Dust can access 'My Drive' where your
            meeting transcripts are stored.
          </Page.P>
          <div>
            <Button
              label="Connect Google"
              size="sm"
              icon={CloudArrowLeftRightIcon}
              onClick={onConnect}
            />
          </div>
        </>
      )}
    </Page.Layout>
  );
}
