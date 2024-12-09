import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  Input,
  Modal,
  Page,
} from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  SnowflakeCredentials,
  WorkspaceType,
} from "@dust-tt/types";
import { isConnectorsAPIError } from "@dust-tt/types";
import { useState } from "react";

import type { ConnectorProviderConfiguration } from "@app/lib/connector_providers";

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
  onCreated?: (dataSource: DataSourceType) => void;
  dataSourceToUpdate: DataSourceType;
};

export function CreateOrUpdateConnectionSnowflakeModal({
  owner,
  connectorProviderConfiguration,
  isOpen,
  onClose,
  createDatasource,
  onCreated,
  dataSourceToUpdate,
}: CreateOrUpdateConnectionSnowflakeModalProps) {
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

  const createSnowflakeConnection = async () => {
    if (!onCreated || !createDatasource) {
      // Should never happen.
      throw new Error("onCreated and createDatasource are required");
    }

    setIsLoading(true);

    // First we post the credentials to OAuth service.
    const getCredentialsRes = await fetch(`/api/w/${owner.sId}/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "snowflake",
        credentials,
      }),
    });

    if (!getCredentialsRes.ok) {
      setError("Failed to create connection: cannot verify those credentials.");
      setIsLoading(false);
      return;
    }

    // Then we can try to create the connector.
    const data = await getCredentialsRes.json();

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

    onCreated(createdManagedDataSource.dataSource);
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

    const data = await credentialsRes.json;
    void data;

    // const createDataSourceRes = await createDatasource({
    //   provider: "snowflake",
    //   connectionId: data.credentials.id,
    // });

    // if (!createDataSourceRes.ok) {
    //   const err = await createDataSourceRes.json();
    //   const maybeConnectorsError = "error" in err && err.error.connectors_error;

    //   if (
    //     isConnectorsAPIError(maybeConnectorsError) &&
    //     maybeConnectorsError.type === "invalid_request_error"
    //   ) {
    //     setError(
    //       `Failed to create Snowflake connection: ${maybeConnectorsError.message}`
    //     );
    //   } else {
    //     setError(`Failed to create Snowflake connection: ${err.error.message}`);
    //   }

    //   setIsLoading(false);
    //   return;
    // }

    // const createdManagedDataSource: {
    //   dataSource: DataSourceType;
    //   connector: ConnectorType;
    // } = await createDataSourceRes.json();

    // onCreated(createdManagedDataSource.dataSource);
    setIsLoading(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Connection Setup"
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <Page variant="modal">
        <div className="w-full">
          <Page.Vertical sizing="grow">
            <Page.Header
              title={`Connecting ${connectorProviderConfiguration.name}`}
              icon={connectorProviderConfiguration.logoComponent}
            />
            <a
              href={connectorProviderConfiguration.guideLink ?? ""}
              target="_blank"
            >
              <Button
                label="Read our guide"
                size="xs"
                variant="outline"
                icon={BookOpenIcon}
              />
            </a>
            {connectorProviderConfiguration.limitations && (
              <div className="flex flex-col gap-y-2">
                <div className="grow text-sm font-medium text-element-800">
                  Limitations
                </div>
                <div className="text-sm font-normal text-element-700">
                  {connectorProviderConfiguration.limitations}
                </div>
              </div>
            )}

            <Page.SectionHeader title="Snowflake Credentials" />

            {error && (
              <div className="w-full rounded-md bg-red-100 p-4 text-red-800">
                {error}
              </div>
            )}

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

            <div className="flex justify-center pt-2">
              <div className="flex gap-2">
                <Button
                  variant="highlight"
                  size="md"
                  icon={CloudArrowLeftRightIcon}
                  onClick={() => {
                    setIsLoading(true);
                    if (dataSourceToUpdate) {
                      void updateSnowflakeConnection();
                    } else {
                      void createSnowflakeConnection();
                    }
                  }}
                  disabled={isLoading || !areCredentialsValid()}
                  label={
                    isLoading
                      ? "Connecting..."
                      : dataSourceToUpdate
                        ? "Update connection"
                        : "Connect and select tables"
                  }
                />
              </div>
            </div>
          </Page.Vertical>
        </div>
      </Page>
    </Modal>
  );
}
