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

type CreateConnectionSnowflakeModalProps = {
  owner: WorkspaceType;
  connectorProviderConfiguration: ConnectorProviderConfiguration;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: ({
    connectionId,
    provider,
    suffix,
  }: {
    connectionId: string;
    provider: ConnectorProvider;
    suffix: string | null;
  }) => Promise<Response>;
  onCreated: (dataSource: DataSourceType) => void;
};

export function CreateConnectionSnowflakeModal({
  owner,
  connectorProviderConfiguration,
  isOpen,
  onClose,
  onSubmit,
  onCreated,
}: CreateConnectionSnowflakeModalProps) {
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
    const createDataSourceRes = await onSubmit({
      provider: "snowflake",
      connectionId: data.credentials.id,
      suffix: null, // TODO(SNOWFLAKE): Manage suffix.
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
                variant="secondary"
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
                name="username"
                value={credentials.account}
                placeholder="au12345.us-east-1"
                onChange={(e) => {
                  setCredentials({ ...credentials, account: e.target.value });
                  setError(null);
                }}
              />
              <Input
                label="Role"
                name="username"
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
              <Button.List isWrapping={true}>
                <Button
                  variant="primary"
                  size="md"
                  icon={CloudArrowLeftRightIcon}
                  onClick={() => {
                    setIsLoading(true);
                    void createSnowflakeConnection();
                  }}
                  disabled={isLoading || !areCredentialsValid()}
                  label={
                    isLoading ? "Connecting..." : "Connect and select tables"
                  }
                />
              </Button.List>
            </div>
          </Page.Vertical>
        </div>
      </Page>
    </Modal>
  );
}
