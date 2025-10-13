// Okay to use public API types because it's front/connectors communication.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isConnectorsAPIError } from "@dust-tt/client";
import {
  BookOpenIcon,
  Button,
  ContentMessage,
  Icon,
  InformationCircleIcon,
  Label,
  Page,
  RadioGroup,
  RadioGroupCustomItem,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
  Tooltip,
} from "@dust-tt/sparkle";
import { isRight } from "fp-ts/lib/Either";
import { formatValidationErrors } from "io-ts-reporters";
import { useEffect, useMemo, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ConnectorProviderConfiguration } from "@app/lib/connector_providers";
import { useBigQueryLocations } from "@app/lib/swr/bigquery";
import type { PostCredentialsBody } from "@app/pages/api/w/[wId]/credentials";
import type {
  BigQueryCredentialsWithLocation,
  CheckBigQueryCredentials,
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  WorkspaceType,
} from "@app/types";
import { CheckBigQueryCredentialsSchema } from "@app/types";

type CreateOrUpdateConnectionBigQueryModalProps = {
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

export function CreateOrUpdateConnectionBigQueryModal({
  owner,
  connectorProviderConfiguration,
  isOpen,
  onClose,
  createDatasource,
  onSuccess: _onSuccess,
  dataSourceToUpdate,
}: CreateOrUpdateConnectionBigQueryModalProps) {
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<string>("");

  const credentialsState = useMemo(() => {
    if (!credentials) {
      return {
        credentials: null,
        valid: false,
        errorMessage: null,
      };
    }

    try {
      const credentialsObject: CheckBigQueryCredentials =
        JSON.parse(credentials);
      const r = CheckBigQueryCredentialsSchema.decode(credentialsObject);
      if (isRight(r)) {
        const allFieldsHaveValue = Object.values(credentialsObject).every(
          (v) => v.length > 0
        );
        return {
          credentials: credentialsObject,
          valid: allFieldsHaveValue,
          errorMessage: !allFieldsHaveValue
            ? "All fields must have a value"
            : null,
        };
      } else {
        return {
          credentials: credentialsObject,
          valid: false,
          errorMessage: formatValidationErrors(r.left).join(" "),
        };
      }
    } catch (error) {
      return {
        credentials: null,
        valid: false,
        errorMessage: "Invalid JSON",
      };
    }
  }, [credentials]);

  // Region picking
  const [selectedLocation, setSelectedLocation] = useState<string>();
  const { locations, isLocationsLoading } = useBigQueryLocations({
    owner,
    credentials: credentialsState.credentials,
  });

  const needToSelectLocation = useMemo(() => {
    return locations && Object.keys(locations).length > 1;
  }, [locations]);

  useEffect(() => {
    if (locations && Object.keys(locations).length === 1) {
      setSelectedLocation(Object.keys(locations)[0]);
    }
  }, [locations]);

  useEffect(() => {
    setError(credentialsState.errorMessage);
  }, [credentialsState.errorMessage]);

  if (connectorProviderConfiguration.connectorProvider !== "bigquery") {
    // Should never happen.
    return null;
  }

  function onSuccess(ds: DataSourceType) {
    setCredentials("");
    _onSuccess(ds);
    setError(null);
  }

  const createBigQueryConnection = async (): Promise<boolean> => {
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
          provider: "bigquery" as const,
          credentials: {
            ...credentialsState.credentials,
            location: selectedLocation,
          } as BigQueryCredentialsWithLocation,
        } as PostCredentialsBody),
      }
    );

    if (!createCredentialsRes.ok) {
      setError("Failed to create connection: cannot verify those credentials.");
      setIsLoading(false);
      return false;
    }

    // Then we can try to create the connector.
    const data = await createCredentialsRes.json();

    const createDataSourceRes = await createDatasource({
      provider: "bigquery",
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
          `Failed to create BigQuery connection: ${maybeConnectorsError.message}`
        );
      } else {
        setError(`Failed to create BigQuery connection: ${err.error.message}`);
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
  };

  const updateBigQueryConnection = async (): Promise<boolean> => {
    if (!dataSourceToUpdate) {
      // Should never happen.
      throw new Error("dataSourceToUpdate is required");
    }

    if (!credentialsState.valid) {
      // Should never happen.
      throw new Error("credentialsState.valid is required");
    }

    setIsLoading(true);

    // First we post the credentials to OAuth service.
    const credentialsRes = await fetch(`/api/w/${owner.sId}/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "bigquery",
        credentials: {
          ...credentialsState.credentials,
          location: selectedLocation,
        } as BigQueryCredentialsWithLocation,
      }),
    });

    if (!credentialsRes.ok) {
      setError("Failed to update connection: cannot verify those credentials.");
      setIsLoading(false);
      return false;
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
          `Failed to update BigQuery connection: ${maybeConnectorsError.message}`
        );
      } else {
        setError(`Failed to update BigQuery connection: ${err.error.message}`);
      }

      return false;
    }

    onSuccess(dataSourceToUpdate);
    return true;
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

            {error && (
              <ContentMessage variant="warning" title="Connection Error">
                {error}
              </ContentMessage>
            )}

            <Page.SectionHeader title="BigQuery Credentials" />
            <TextArea
              className="min-h-[300px] font-mono text-[13px]"
              name="service_account_json"
              value={credentials}
              placeholder="Paste service account JSON here"
              onChange={(e) => setCredentials(e.target.value)}
            />

            {needToSelectLocation && (
              <div className="flex flex-col gap-4">
                <Page.SectionHeader title="Select Location" />
                <RadioGroup
                  value={selectedLocation}
                  onValueChange={setSelectedLocation}
                >
                  {Object.entries(locations).map(([location, tables]) => (
                    <RadioGroupCustomItem
                      key={location}
                      id={location}
                      value={location}
                      customItem={
                        <Tooltip
                          label={
                            <>
                              This location contains {tables.length} tables that
                              can be connected :{" "}
                              <span className="text-xs text-gray-500">
                                {tables.join(", ")}
                              </span>
                            </>
                          }
                          trigger={
                            <Label
                              htmlFor={location}
                              className="flex cursor-pointer items-center gap-1"
                            >
                              <span className="font-semibold">{location}</span>{" "}
                              - {tables.length} tables <InformationCircleIcon />
                            </Label>
                          }
                        />
                      }
                    />
                  ))}
                </RadioGroup>
              </div>
            )}
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
              const success = dataSourceToUpdate
                ? await updateBigQueryConnection()
                : await createBigQueryConnection();
              setIsLoading(false);

              if (success) {
                onClose();
              }
            },
            isLoading: isLoading || isLocationsLoading,
            disabled:
              isLoading ||
              isLocationsLoading ||
              !credentialsState.valid ||
              !selectedLocation,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
