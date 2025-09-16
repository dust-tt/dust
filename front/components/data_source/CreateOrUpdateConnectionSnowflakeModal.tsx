// Okay to use public API types because it's front/connectors communication.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isConnectorsAPIError } from "@dust-tt/client";
import {
  BookOpenIcon,
  Button,
  Chip,
  Icon,
  Input,
  Page,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
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
  const [authType, setAuthType] = useState<"password" | "keypair">("password");
  const [credentials, setCredentials] = useState<SnowflakeCredentials>({
    auth_type: "password",
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
    const baseFieldsValid =
      credentials.account.length > 0 &&
      credentials.role.length > 0 &&
      credentials.warehouse.length > 0 &&
      credentials.username.length > 0;

    if ("password" in credentials) {
      return baseFieldsValid && credentials.password.length > 0;
    } else if ("private_key" in credentials) {
      return baseFieldsValid && credentials.private_key.length > 0;
    }
    return false;
  };

  function onSuccess(ds: DataSourceType) {
    setCredentials({
      auth_type: "password",
      username: "",
      password: "",
      account: "",
      role: "",
      warehouse: "",
    });
    setAuthType("password");
    _onSuccess(ds);
    onClose();
  }

  const handleAuthTypeChange = (newAuthType: "password" | "keypair") => {
    setAuthType(newAuthType);
    if (newAuthType === "password") {
      setCredentials({
        auth_type: "password",
        username: credentials.username,
        password: "",
        account: credentials.account,
        role: credentials.role,
        warehouse: credentials.warehouse,
      });
    } else {
      setCredentials({
        auth_type: "keypair",
        username: credentials.username,
        private_key: "",
        private_key_passphrase: undefined,
        account: credentials.account,
        role: credentials.role,
        warehouse: credentials.warehouse,
      });
    }
    setError(null);
  };

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

            {error && (
              <Chip color="warning" size="sm">
                {error}
              </Chip>
            )}

            <div className="w-full space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Authentication Method
                </label>
                <RadioGroup
                  name="authType"
                  value={authType}
                  onValueChange={(value: string) =>
                    handleAuthTypeChange(value as "password" | "keypair")
                  }
                >
                  <RadioGroupItem
                    value="password"
                    label="Username & Password"
                  />
                  <RadioGroupItem
                    value="keypair"
                    label="Key Pair Authentication"
                  />
                </RadioGroup>
              </div>
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
              {authType === "password" ? (
                <Input
                  label="Password"
                  name="password"
                  type="password"
                  value={"password" in credentials ? credentials.password : ""}
                  placeholder=""
                  onChange={(e) => {
                    setCredentials({
                      ...credentials,
                      auth_type: "password",
                      password: e.target.value,
                    } as SnowflakeCredentials);
                    setError(null);
                  }}
                />
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Private Key (PEM format)
                    </label>
                    <TextArea
                      name="privateKey"
                      value={
                        "private_key" in credentials
                          ? credentials.private_key
                          : ""
                      }
                      placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                      rows={8}
                      onChange={(e) => {
                        setCredentials({
                          ...credentials,
                          auth_type: "keypair",
                          private_key: e.target.value,
                        } as SnowflakeCredentials);
                        setError(null);
                      }}
                    />
                  </div>
                  <Input
                    label="Private Key Passphrase (optional)"
                    name="privateKeyPassphrase"
                    type="password"
                    value={
                      "private_key_passphrase" in credentials
                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        ? credentials.private_key_passphrase || ""
                        : ""
                    }
                    placeholder="Leave empty if key is not encrypted"
                    onChange={(e) => {
                      setCredentials({
                        ...credentials,
                        auth_type: "keypair",
                        private_key_passphrase: e.target.value || undefined,
                      } as SnowflakeCredentials);
                      setError(null);
                    }}
                  />
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">To use key-pair authentication:</p>
                    <ol className="ml-4 list-decimal space-y-1">
                      <li>Generate an RSA key pair (minimum 2048 bits)</li>
                      <li>Register the public key with your Snowflake user</li>
                      <li>Paste the private key above in PEM format</li>
                    </ol>
                  </div>
                </>
              )}
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
            onClick: async (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              setIsLoading(true);
              dataSourceToUpdate
                ? await updateSnowflakeConnection()
                : await createSnowflakeConnection();
            },
            isLoading: isLoading,
            disabled: isLoading || !areCredentialsValid(),
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
