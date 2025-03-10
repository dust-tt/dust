import {
  Button,
  CloudArrowLeftRightIcon,
  Input,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  LabsTranscriptsProviderType,
  WorkspaceType,
} from "@dust-tt/types";
import { setupOAuthConnection } from "@dust-tt/types";

interface ProviderSelectionProps {
  owner: WorkspaceType;
  transcriptsConfiguration: any;
  transcriptsConfigurationState: {
    provider: string;
    isGDriveConnected: boolean;
    isModjoConnected: boolean;
    credentialId: string | null;
    hasDefaultConfiguration: boolean;
  };
  setTranscriptsConfigurationState: (state: any) => void;
  isGongConnectorConnected: boolean;
  handleProviderChange: (provider: LabsTranscriptsProviderType) => void;
  handleConnectGoogleTranscriptsSource: () => Promise<void>;
  handleConnectModjoTranscriptsSource: () => Promise<void>;
  setIsDeleteProviderDialogOpened: (isOpen: boolean) => void;
}

export function ProviderSelection({
  owner,
  transcriptsConfiguration,
  transcriptsConfigurationState,
  setTranscriptsConfigurationState,
  isGongConnectorConnected,
  handleProviderChange,
  handleConnectGoogleTranscriptsSource,
  handleConnectModjoTranscriptsSource,
  setIsDeleteProviderDialogOpened,
}: ProviderSelectionProps) {
  return (
    <Page.Layout direction="vertical">
      <Page.SectionHeader title="Connect your transcripts provider" />
      {!transcriptsConfiguration && (
        <Page.Layout direction="horizontal" gap="xl">
          <div
            className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
              transcriptsConfigurationState.provider == "google_drive"
                ? "border-gray-400"
                : "border-gray-200"
            }`}
            onClick={() => handleProviderChange("google_drive")}
          >
            <img
              src="/static/labs/transcripts/google.png"
              style={{ maxHeight: "35px" }}
            />
          </div>
          <div
            className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
              transcriptsConfigurationState.provider == "gong"
                ? "border-gray-400"
                : "border-gray-200"
            }`}
            onClick={() => handleProviderChange("gong")}
          >
            <img
              src="/static/labs/transcripts/gong.jpeg"
              style={{ maxHeight: "35px" }}
            />
          </div>
          <div
            className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
              transcriptsConfigurationState.provider == "modjo"
                ? "border-gray-400"
                : "border-gray-200"
            }`}
            onClick={() => handleProviderChange("modjo")}
          >
            <img
              src="/static/labs/transcripts/modjo.png"
              style={{ maxHeight: "35px" }}
            />
          </div>
        </Page.Layout>
      )}

      {/* Provider specific connection sections */}
      {renderProviderConnection()}
    </Page.Layout>
  );

  function renderProviderConnection() {
    switch (transcriptsConfigurationState.provider) {
      case "google_drive":
        return renderGoogleDriveConnection();
      case "gong":
        return renderGongConnection();
      case "modjo":
        return renderModjoConnection();
      default:
        return null;
    }
  }

  function renderGoogleDriveConnection() {
    return (
      <Page.Layout direction="vertical">
        {transcriptsConfigurationState.isGDriveConnected ? (
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
                onClick={handleConnectGoogleTranscriptsSource}
              />
            </div>
          </>
        )}
      </Page.Layout>
    );
  }

  function renderGongConnection() {
    return (
      <Page.Layout direction="vertical">
        {isGongConnectorConnected ? (
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
            <Page.P>
              Please connect to Gong in the Connection Admin section so Dust can
              access your meeting transcripts before processing them.
            </Page.P>
          </>
        )}
      </Page.Layout>
    );
  }

  function renderModjoConnection() {
    return (
      <Page.Layout direction="vertical">
        {transcriptsConfigurationState.isModjoConnected ? (
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
            <Page.P>
              Connect to Modjo so Dust can access your meeting transcripts.
            </Page.P>
            <div className="flex gap-2">
              {!transcriptsConfigurationState.hasDefaultConfiguration && (
                <Input
                  placeholder="Modjo API key"
                  value={transcriptsConfigurationState.credentialId}
                  onChange={(e) =>
                    setTranscriptsConfigurationState({
                      ...transcriptsConfigurationState,
                      credentialId: e.target.value,
                    })
                  }
                />
              )}
              <Button
                label="Connect Modjo"
                size="sm"
                icon={CloudArrowLeftRightIcon}
                onClick={handleConnectModjoTranscriptsSource}
              />
            </div>
          </>
        )}
      </Page.Layout>
    );
  }
}
