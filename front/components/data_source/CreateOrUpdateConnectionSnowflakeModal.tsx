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
  SnowflakeKeyPairCredentials,
  SnowflakePasswordCredentials,
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
  const [authMethod, setAuthMethod] = useState<"password" | "keypair">("password");
  
  // For password authentication
  const [passwordCredentials, setPasswordCredentials] = useState<SnowflakePasswordCredentials>({
    username: "",
    password: "",
    account: "",
    role: "",
    warehouse: "",
    authenticator: "SNOWFLAKE",
  });
  
  // For key pair authentication
  const [privateKey, setPrivateKey] = useState<string>("");
  const [privateKeyPassphrase, setPrivateKeyPassphrase] = useState<string>("");

  if (connectorProviderConfiguration.connectorProvider !== "snowflake") {
    // Should never happen.
    return null;
  }

  const areCredentialsValid = () => {
    const commonFieldsValid = 
      passwordCredentials.username.trim() !== "" &&
      passwordCredentials.account.trim() !== "" &&
      passwordCredentials.role.trim() !== "" &&
      passwordCredentials.warehouse.trim() !== "";
    
    if (!commonFieldsValid) return false;
    
    if (authMethod === "password") {
      return passwordCredentials.password.trim() !== "";
    } else {
      return privateKey.trim() !== "";
    }
  };

  function onSuccess(ds: DataSourceType) {
    // Reset all form fields
    setPasswordCredentials({
      username: "",
      password: "",
      account: "",
      role: "",
      warehouse: "",
      authenticator: "SNOWFLAKE",
    });
    setPrivateKey("");
    setPrivateKeyPassphrase("");
    setAuthMethod("password");
    _onSuccess(ds);
    onClose();
  }

  const createSnowflakeConnection = async () => {
    if (!onSuccess || !createDatasource) {
      // Should never happen.
      throw new Error("onCreated and createDatasource are required");
    }

    setIsLoading(true);

    // Prepare credentials based on authentication method
    let snowflakeCredentials: SnowflakeCredentials;
    if (authMethod === "password") {
      snowflakeCredentials = {
        ...passwordCredentials
      };
    } else {
      snowflakeCredentials = {
        username: passwordCredentials.username,
        account: passwordCredentials.account,
        role: passwordCredentials.role,
        warehouse: passwordCredentials.warehouse,
        privateKey: privateKey,
        privateKeyPassphrase: privateKeyPassphrase || undefined,
        authenticator: "SNOWFLAKE_JWT",
      };
    }

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
          credentials: snowflakeCredentials,
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

    // Prepare credentials based on authentication method
    let snowflakeCredentials: SnowflakeCredentials;
    if (authMethod === "password") {
      snowflakeCredentials = {
        ...passwordCredentials
      };
    } else {
      snowflakeCredentials = {
        username: passwordCredentials.username,
        account: passwordCredentials.account,
        role: passwordCredentials.role,
        warehouse: passwordCredentials.warehouse,
        privateKey: privateKey,
        privateKeyPassphrase: privateKeyPassphrase || undefined,
        authenticator: "SNOWFLAKE_JWT",
      };
    }

    // First we post the credentials to OAuth service.
    const credentialsRes = await fetch(`/api/w/${owner.sId}/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "snowflake",
        credentials: snowflakeCredentials,
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
              {/* Common fields */}
              <Input
                label="Snowflake Account identifier"
                name="account_identifier"
                value={passwordCredentials.account}
                placeholder="au12345.us-east-1"
                onChange={(e) => {
                  setPasswordCredentials({ 
                    ...passwordCredentials, 
                    account: e.target.value 
                  });
                  setError(null);
                }}
              />
              <Input
                label="Role"
                name="role"
                value={passwordCredentials.role}
                placeholder="dev_role"
                onChange={(e) => {
                  setPasswordCredentials({ 
                    ...passwordCredentials, 
                    role: e.target.value 
                  });
                  setError(null);
                }}
              />
              <Input
                label="Warehouse"
                name="warehouse"
                value={passwordCredentials.warehouse}
                placeholder="dev_warehouse"
                onChange={(e) => {
                  setPasswordCredentials({ 
                    ...passwordCredentials, 
                    warehouse: e.target.value 
                  });
                  setError(null);
                }}
              />
              <Input
                label="Username"
                name="username"
                value={passwordCredentials.username}
                placeholder="dev_user"
                onChange={(e) => {
                  setPasswordCredentials({ 
                    ...passwordCredentials, 
                    username: e.target.value 
                  });
                  setError(null);
                }}
              />
              
              {/* Authentication Method Selection */}
              <div className="flex flex-col gap-2 pt-2">
                <div className="text-sm font-medium">Authentication Method</div>
                <div className="flex space-x-4">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="auth-password"
                      name="auth-method"
                      checked={authMethod === "password"}
                      onChange={() => {
                        setAuthMethod("password");
                        setError(null);
                      }}
                      className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                    />
                    <label
                      htmlFor="auth-password"
                      className="ml-2 block text-sm text-gray-600 dark:text-gray-300"
                    >
                      Username & Password
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="auth-keypair"
                      name="auth-method"
                      checked={authMethod === "keypair"}
                      onChange={() => {
                        setAuthMethod("keypair");
                        setError(null);
                      }}
                      className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                    />
                    <label
                      htmlFor="auth-keypair"
                      className="ml-2 block text-sm text-gray-600 dark:text-gray-300"
                    >
                      Key Pair Authentication (more secure)
                    </label>
                  </div>
                </div>
              </div>
              
              {/* Conditional fields based on authentication method */}
              {authMethod === "password" ? (
                <Input
                  label="Password"
                  name="password"
                  type="password"
                  value={passwordCredentials.password}
                  placeholder=""
                  onChange={(e) => {
                    setPasswordCredentials({ 
                      ...passwordCredentials, 
                      password: e.target.value 
                    });
                    setError(null);
                  }}
                />
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-950">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          You must first generate an RSA key pair and register the public key with your Snowflake user account.
                          <a
                            href="https://docs.snowflake.com/en/user-guide/key-pair-auth"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 whitespace-nowrap font-medium text-blue-700 underline dark:text-blue-300"
                          >
                            Learn more
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Private Key (PKCS8 format)</label>
                    <textarea
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-500 shadow-sm focus:border-primary focus:ring-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      placeholder="-----BEGIN PRIVATE KEY-----&#10;MIIEvQIBADANBgkqhkiG9w0BAQEFAAS...&#10;-----END PRIVATE KEY-----"
                      value={privateKey}
                      onChange={(e) => {
                        setPrivateKey(e.target.value);
                        setError(null);
                      }}
                      rows={8}
                    />
                  </div>
                  
                  <Input
                    label="Private Key Passphrase (if encrypted)"
                    name="private_key_passphrase"
                    type="password"
                    value={privateKeyPassphrase}
                    onChange={(e) => {
                      setPrivateKeyPassphrase(e.target.value);
                      setError(null);
                    }}
                  />
                </div>
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
