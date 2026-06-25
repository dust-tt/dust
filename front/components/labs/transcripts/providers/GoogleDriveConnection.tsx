import type { LabsTranscriptsConfigurationType } from "@app/types/labs";
import { Button, CloudArrowLeftRight, Page, XClose } from "@dust-tt/sparkle";

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
            icon={CloudArrowLeftRight}
            disabled={true}
          />
          <Button
            label="Disconnect"
            icon={XClose}
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
              icon={CloudArrowLeftRight}
              onClick={onConnect}
            />
          </div>
        </>
      )}
    </Page.Layout>
  );
}
