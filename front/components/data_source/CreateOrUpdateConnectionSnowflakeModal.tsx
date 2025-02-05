import { Button, Input, Modal, Page } from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { setupOAuthConnection } from "@dust-tt/types";
import { useState } from "react";

import type { ConnectorProviderConfiguration } from "@app/lib/connector_providers";

type CreateOrUpdateConnectionSalesforceModalProps = {
  owner: WorkspaceType;
  connectorProviderConfiguration: ConnectorProviderConfiguration;
  isOpen: boolean;
  onClose: () => void;
  createDatasource?: ({
    connectionId,
    provider,
  }: {
    connectionId: string;
    provider: ConnectorProvider;
  }) => Promise<Response>;
  onSuccess: (dataSource: DataSourceType) => void;
  dataSourceToUpdate?: DataSourceType;
  clientFacingUrl: string;
};

export function CreateOrUpdateConnectionSalesforceModal({
  owner,
  connectorProviderConfiguration,
  isOpen,
  onClose,
  createDatasource,
  onSuccess,
  clientFacingUrl,
}: CreateOrUpdateConnectionSalesforceModalProps) {
  const [instanceUrl, setInstanceUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (connectorProviderConfiguration.connectorProvider !== "salesforce") {
    return null;
  }

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const connection = await setupOAuthConnection({
        dustClientFacingUrl: clientFacingUrl,
        owner,
        provider: "salesforce",
        useCase: "connection",
        extraConfig: {
          instance_url: instanceUrl,
        },
      });

      if (!connection.isOk()) {
        setError(connection.error.message);
        return;
      }

      if (!createDatasource) {
        throw new Error("createDatasource is required");
      }

      const createDataSourceRes = await createDatasource({
        provider: "salesforce",
        connectionId: connection.value.connection_id,
      });

      if (!createDataSourceRes.ok) {
        const err = await createDataSourceRes.json();
        setError(
          `Failed to create Salesforce connection: ${err.error.message}`
        );
        return;
      }

      const createdManagedDataSource: {
        dataSource: DataSourceType;
      } = await createDataSourceRes.json();

      onSuccess(createdManagedDataSource.dataSource);
    } catch (e) {
      setError("Failed to connect to Salesforce. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect to Salesforce"
      variant="side-sm"
      hasChanged={false}
    >
      <Page>
        <div className="p-6">
          <Page.Vertical gap="lg" align="stretch">
            <Page.Header
              title="Connect your Salesforce instance"
              description={connectorProviderConfiguration.description}
            />

            {connectorProviderConfiguration.guideLink && (
              <a
                href={connectorProviderConfiguration.guideLink}
                target="_blank"
                rel="noreferrer"
              >
                <Button label="Read our guide" variant="tertiary" size="xs" />
              </a>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Salesforce Instance URL
              </label>
              <Input
                name="instanceUrl"
                type="url"
                placeholder="https://your-instance.salesforce.com"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                className="w-full"
              />
              <p className="mt-1 text-sm text-gray-500">
                Enter your Salesforce instance URL. This is usually in the
                format https://something.salesforce.com
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                label="Cancel"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleConnect}
                loading={isLoading}
                disabled={!instanceUrl || isLoading}
                label={isLoading ? "Connecting..." : "Connect"}
              />
            </div>
          </Page.Vertical>
        </div>
      </Page>
    </Modal>
  );
}
