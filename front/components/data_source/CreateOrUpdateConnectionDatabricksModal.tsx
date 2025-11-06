// Okay to use public API types because it's front/connectors communication.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isConnectorsAPIError } from "@dust-tt/client";
import {
  BookOpenIcon,
  Button,
  ContentMessage,
  Icon,
  Input,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ConnectorProviderConfiguration } from "@app/lib/connector_providers";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  DatabricksCredentials,
  WorkspaceType,
} from "@app/types";

type CreateOrUpdateConnectionDatabricksModalProps = {
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
};

export function CreateOrUpdateConnectionDatabricksModal({
  owner,
  connectorProviderConfiguration,
  isOpen,
  onClose,
  createDatasource,
  onSuccess,
  dataSourceToUpdate,
}: CreateOrUpdateConnectionDatabricksModalProps) {
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<DatabricksCredentials>({
    host: "",
    http_path: "",
    access_token: "",
  });

  if (connectorProviderConfiguration.connectorProvider !== "databricks") {
    // Should never happen.
    return null;
  }

  const areCredentialsValid = () =>
    credentials.host.trim().length > 0 &&
    credentials.http_path.trim().length > 0 &&
    credentials.access_token.trim().length > 0;

  function resetState() {
    setCredentials({ host: "", http_path: "", access_token: "" });
    setError(null);
  }

  async function createConnection(): Promise<boolean> {
    if (!createDatasource) {
      throw new Error("createDatasource is required");
    }

    setIsLoading(true);

    const res = await fetch(`/api/w/${owner.sId}/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "databricks" as const,
        credentials,
      }),
    });

    if (!res.ok) {
      setError(
        "Failed to create connection: cannot verify those credentials."
      );
      setIsLoading(false);
      return false;
    }

    const data = await res.json();

    const createDataSourceRes = await createDatasource({
      provider: "databricks",
      connectionId: data.credentials.id,
    });

    if (!createDataSourceRes.ok) {
      const err = await createDataSourceRes.json();
      const maybeConnectorsError =
        "error" in err && err.error.connectors_error;

      if (
        isConnectorsAPIError(maybeConnectorsError) &&
        maybeConnectorsError.type === "invalid_request_error"
      ) {
        setError(
          `Failed to create Databricks connection: ${maybeConnectorsError.message}`
        );
      } else {
        setError(
          `Failed to create Databricks connection: ${err.error.message}`
        );
      }

      setIsLoading(false);
      return false;
    }

    const createdManagedDataSource: {
      dataSource: DataSourceType;
      connector: ConnectorType;
    } = await createDataSourceRes.json();

    onSuccess(createdManagedDataSource.dataSource);
    setIsLoading(false);
    return true;
  }

  async function updateConnection(): Promise<boolean> {
    if (!dataSourceToUpdate) {
      throw new Error("dataSourceToUpdate is required");
    }

    setIsLoading(true);

    const res = await fetch(`/api/w/${owner.sId}/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "databricks" as const,
        credentials,
      }),
    });

    if (!res.ok) {
      setError(
        "Failed to update connection: cannot verify those credentials."
      );
      setIsLoading(false);
      return false;
    }

    const data = await res.json();

    const updateConnectorRes = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSourceToUpdate.sId}/managed/update`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId: data.credentials.id,
        }),
      }
    );

    setIsLoading(false);

    if (!updateConnectorRes.ok) {
      const err = await updateConnectorRes.json();
      const maybeConnectorsError =
        "error" in err && err.error.connectors_error;

      if (
        isConnectorsAPIError(maybeConnectorsError) &&
        maybeConnectorsError.type === "invalid_request_error"
      ) {
        setError(
          `Failed to update Databricks connection: ${maybeConnectorsError.message}`
        );
      } else {
        setError(
          `Failed to update Databricks connection: ${err.error.message}`
        );
      }

      return false;
    }

    onSuccess(dataSourceToUpdate);
    return true;
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="[&>svg]:h-6 [&>svg]:w-6">
              <Icon
                visual={connectorProviderConfiguration.getLogoComponent(isDark)}
              />
            </span>
            Connecting {connectorProviderConfiguration.name}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <Button
                label="Read our guide"
                size="sm"
                href={connectorProviderConfiguration.guideLink ?? ""}
                variant="outline"
                target="_blank"
                rel="noopener noreferrer"
                icon={BookOpenIcon}
              />

              {connectorProviderConfiguration.limitations && (
                <ContentMessage
                  variant="primary"
                  title="Limitations"
                  className="border-none"
                >
                  {connectorProviderConfiguration.limitations}
                </ContentMessage>
              )}
            </div>

            <Page.SectionHeader title="Databricks Credentials" />

            {error && (
              <ContentMessage variant="warning" title="Connection Error">
                {error}
              </ContentMessage>
            )}

            <div className="flex flex-col gap-4">
              <Input
                label="Workspace Host"
                name="host"
                value={credentials.host}
                placeholder="dbc-xxxxxxxx-xxxx.cloud.databricks.com"
                onChange={(e) => {
                  setCredentials((prev) => ({
                    ...prev,
                    host: e.target.value,
                  }));
                  setError(null);
                }}
              />
              <Input
                label="HTTP Path"
                name="http_path"
                value={credentials.http_path}
                placeholder="/sql/1.0/warehouses/xxxxxxxxxxxxxxxx"
                onChange={(e) => {
                  setCredentials((prev) => ({
                    ...prev,
                    http_path: e.target.value,
                  }));
                  setError(null);
                }}
              />
              <Input
                label="Personal Access Token"
                name="access_token"
                type="password"
                value={credentials.access_token}
                onChange={(e) => {
                  setCredentials((prev) => ({
                    ...prev,
                    access_token: e.target.value,
                  }));
                  setError(null);
                }}
              />
            </div>
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => {
              onClose();
              resetState();
            },
          }}
          rightButtonProps={{
            label: isLoading ? "Saving..." : "Save",
            isLoading,
            disabled: isLoading || !areCredentialsValid(),
            onClick: async (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();

              setIsLoading(true);
              const success = dataSourceToUpdate
                ? await updateConnection()
                : await createConnection();
              setIsLoading(false);

              if (success) {
                resetState();
                onClose();
              }
            },
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

