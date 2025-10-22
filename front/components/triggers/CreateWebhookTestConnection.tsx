import { Button, Label, RocketIcon, Spinner } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType, OAuthConnectionType } from "@app/types";
import { setupOAuthConnection } from "@app/types";

// Type for test service data
type TestServiceData = { info: string; timestamp: number };

type CreateWebhookTestConnectionProps<TServiceData> = {
  owner: LightWorkspaceType;
  serviceData: TServiceData | null;
  isFetchingServiceData: boolean;
  onFetchServiceData: (connectionId: string) => Promise<void>;
  onTestDataChange?: (
    data: {
      connectionId: string;
    } | null
  ) => void;
  onReadyToSubmitChange?: (isReady: boolean) => void;
};

export function CreateWebhookTestConnection({
  owner,
  serviceData,
  isFetchingServiceData,
  onFetchServiceData,
  onTestDataChange,
  onReadyToSubmitChange,
}: CreateWebhookTestConnectionProps<TestServiceData>) {
  const sendNotification = useSendNotification();
  const [testConnection, setTestConnection] =
    useState<OAuthConnectionType | null>(null);
  const [isConnectingTest, setIsConnectingTest] = useState(false);

  // Notify parent component when test data changes
  useEffect(() => {
    const isReady = !!testConnection;

    if (isReady && onTestDataChange) {
      onTestDataChange({
        connectionId: testConnection.connection_id,
      });
    } else if (onTestDataChange) {
      onTestDataChange(null);
    }

    // Notify parent about ready state
    if (onReadyToSubmitChange) {
      onReadyToSubmitChange(isReady);
    }
  }, [testConnection, onTestDataChange, onReadyToSubmitChange]);

  const handleConnectTest = async () => {
    if (!owner) {
      return;
    }

    setIsConnectingTest(true);
    try {
      const connectionRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider: "test",
        useCase: "webhooks",
        extraConfig: {},
      });

      if (connectionRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to connect to Test service",
          description: connectionRes.error.message,
        });
      } else {
        setTestConnection(connectionRes.value);
        sendNotification({
          type: "success",
          title: "Connected to Test service",
          description: "Fetching test data...",
        });
        // Fetch service data after successful connection
        await onFetchServiceData(connectionRes.value.connection_id);
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect to Test service",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsConnectingTest(false);
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <div>
        <Label>Test Connection</Label>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Connect to the test service to try out webhooks.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant={"outline"}
            label={
              testConnection ? "Connected to Test" : "Connect to Test"
            }
            icon={RocketIcon}
            onClick={handleConnectTest}
            disabled={isConnectingTest || !!testConnection}
          />
          {isConnectingTest && <Spinner size="sm" />}
        </div>
      </div>

      {testConnection && (
        <div>
          <Label>Test Service Data</Label>
          {isFetchingServiceData ? (
            <div className="mt-2 flex items-center gap-2 py-2">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Loading test data...
              </span>
            </div>
          ) : serviceData ? (
            <div className="border-border-light bg-background-light dark:bg-background-dark mt-2 space-y-2 rounded border px-3 py-2 dark:border-border-dark">
              <div className="text-sm">
                <span className="font-medium">Info:</span> {serviceData.info}
              </div>
              <div className="text-sm">
                <span className="font-medium">Timestamp:</span>{" "}
                {new Date(serviceData.timestamp).toLocaleString()}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No test data available
            </p>
          )}
        </div>
      )}
    </div>
  );
}
