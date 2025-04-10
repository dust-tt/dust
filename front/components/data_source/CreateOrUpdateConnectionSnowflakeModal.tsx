import { isConnectorsAPIError } from "@dust-tt/client";
import {
  BookOpenIcon,
  Button,
  Chip,
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
  SnowflakeCredentials,
  WorkspaceType,
} from "@app/types";

type CreateOrUpdateConnectionSnowflakeModalProps = {
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

export function CreateOrUpdateConnectionSnowflakeModal({
  owner,
  connectorProviderConfiguration,
  isOpen,
  onClose,
  createDatasource,
  onSuccess: _onSuccess,
  dataSourceToUpdate,
}: CreateOrUpdateConnectionSnowflakeModalProps) {
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<SnowflakeCredentials>({
    username: "",
    password: "",
    account: "",
    role: "",
    warehouse: "",
  });

  if (connectorProviderConfiguration.connectorProvider !== "snowflake") {
    // Should never happen.
    return null;
  }

  const areCredentialsValid = () => {
    return Object.values(credentials).every((value) => value.length > 0);
  };

  function onSuccess(ds: DataSourceType) {
    setCredentials({
      username: "",
      password: "",
      account: "",
      role: "",
      warehouse: "",
    });
    _onSuccess(ds);
    onClose();
  }

  const createSnowflakeConnection = async () => {
    if (!onSuccess || !createDatasource) {
      // Should never happen.
      throw new Error("onCreated and createDatasource are required");
    }

    setIsLoading(true);

    // First we post the credentials to OAuth service.
    const createCredentialsRes = await fetch(
      `/api/w/${owner.sId}/credentials`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "snowflake",
          credentials,
        }),
      }
    );

    if (!createCredentialsRes.ok) {
      setError("Failed to create connection: cannot verify those credentials.");
      setIsLoading(false);
      return;
    }

    // Then we can try to create the connector.
    const data = await createCredentialsRes.json();

    const createDataSourceRes = await createDatasource({
      provider: "snowflake",
      connectionId: data.credentials.id,
    });

    if (!createDataSourceRes.ok) {
      const err = await createDataSourceRes.json();
      const maybeConnectorsError = "error" in err && err.error.connectors_error;

      if (
        isConnectorsAPIError(maybeConnectorsError) &&
        maybeConnectorsError.type === "invalid_request_error"
      ) {
        setError(
          `Failed to create Snowflake connection: ${maybeConnectorsError.message}`
        );
      } else {
        setError(`Failed to create Snowflake connection: ${err.error.message}`);
      }

      setIsLoading(false);
      return;
    }

    const createdManagedDataSource: {
      dataSource: DataSourceType;
      connector: ConnectorType;
    } = await createDataSourceRes.json();

    onSuccess(createdManagedDataSource.dataSource);
    setIsLoading(false);
  };

  const updateSnowflakeConnection = async () => {
    if (!dataSourceToUpdate) {
      // Should never happen.
      throw new Error("dataSourceToUpdate is required");
    }

    setIsLoading(true);

    // First we post the credentials to OAuth service.
    const credentialsRes = await fetch(`/api/w/${owner.sId}/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "snowflake",
        credentials,
      }),
    });

    if (!credentialsRes.ok) {
      setError("Failed to update connection: cannot verify those credentials.");
      setIsLoading(false);
      return;
    }

    const data = await credentialsRes.json();

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
      const maybeConnectorsError = "error" in err && err.error.connectors_error;

      if (
        isConnectorsAPIError(maybeConnectorsError) &&
        maybeConnectorsError.type === "invalid_request_error"
      ) {
        setError(
          `Failed to update Snowflake connection: ${maybeConnectorsError.message}`
        );
      } else {
        setError(`Failed to update Snowflake connection: ${err.error.message}`);
      }

      return;
    }

    onSuccess(dataSourceToUpdate);
  };

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
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                icon={BookOpenIcon}
              />

              {connectorProviderConfiguration.limitations && (
                <div className="flex flex-col gap-y-2">
                  <div className="grow text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
                    Limitations
                  </div>
                  <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                    {connectorProviderConfiguration.limitations}
                  </div>
                </div>
              )}
            </div>

            <Page.SectionHeader title="Snowflake Credentials" />

            {error && <Chip color="warning" label={error} />}

            <div className="w-full space-y-4">
              <Input
                label="Snowflake Account identifier"
                name="account_identifier"
                value={credentials.account}
                placeholder="au12345.us-east-1"
                onChange={(e) => {
                  setCredentials({ ...credentials, account: e.target.value });
                  setError(null);
                }}
              />
              <Input
                label="Role"
                name="role"
                value={credentials.role}
                placeholder="dev_role"
                onChange={(e) => {
                  setCredentials({ ...credentials, role: e.target.value });
                  setError(null);
                }}
              />
              <Input
                label="Warehouse"
                name="warehouse"
                value={credentials.warehouse}
                placeholder="dev_warehouse"
                onChange={(e) => {
                  setCredentials({ ...credentials, warehouse: e.target.value });
                  setError(null);
                }}
              />
              <Input
                label="Username"
                name="username"
                value={credentials.username}
                placeholder="dev_user"
                onChange={(e) => {
                  setCredentials({ ...credentials, username: e.target.value });
                  setError(null);
                }}
              />
              <Input
                label="Password"
                name="password"
                type="password"
                value={credentials.password}
                placeholder=""
                onChange={(e) => {
                  setCredentials({ ...credentials, password: e.target.value });
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
          }}
          rightButtonProps={{
            label: isLoading ? "Saving..." : "Save",
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              dataSourceToUpdate
                ? void updateSnowflakeConnection()
                : void createSnowflakeConnection();
            },
            disabled: isLoading || !areCredentialsValid(),
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
