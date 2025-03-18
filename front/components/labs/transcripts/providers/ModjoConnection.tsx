import {
  Button,
  CloudArrowLeftRightIcon,
  Input,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";

import type { LabsTranscriptsConfigurationType } from "@app/types";

interface ModjoConnectionProps {
  transcriptsConfiguration: LabsTranscriptsConfigurationType | null;
  setIsDeleteProviderDialogOpened: (isOpen: boolean) => void;
  defaultModjoConfiguration: LabsTranscriptsConfigurationType | null;
  apiKey: string;
  setApiKey: (value: string) => void;
  onConnect: (params: {
    credentialId: string | null;
    defaultModjoConfiguration: LabsTranscriptsConfigurationType | null;
  }) => void;
}

export function ModjoConnection({
  transcriptsConfiguration,
  setIsDeleteProviderDialogOpened,
  defaultModjoConfiguration,
  apiKey,
  setApiKey,
  onConnect,
}: ModjoConnectionProps) {
  return (
    <Page.Layout direction="vertical">
      {transcriptsConfiguration ? (
        <Page.Layout direction="horizontal">
          <Button
            label="Modjo connected"
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
          <div className="flex gap-2">
            {!defaultModjoConfiguration ? (
              <Page.Layout direction="vertical">
                <div>
                  <Page.P>
                    Connect to Modjo so Dust can access your meeting
                    transcripts.
                  </Page.P>
                </div>
                <div>
                  <Input
                    placeholder="Modjo API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
              </Page.Layout>
            ) : (
              <Page.P>
                Modjo is already active on your workspace so you can go ahead
                and process your own calls transcripts.
              </Page.P>
            )}
          </div>
          <div>
            <Button
              label="Connect Modjo"
              size="sm"
              icon={CloudArrowLeftRightIcon}
              onClick={() =>
                onConnect({
                  credentialId: apiKey,
                  defaultModjoConfiguration,
                })
              }
            />
          </div>
        </>
      )}
    </Page.Layout>
  );
}
