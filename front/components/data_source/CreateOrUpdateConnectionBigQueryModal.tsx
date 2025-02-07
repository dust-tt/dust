import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  InformationCircleIcon,
  Label,
  Modal,
  Page,
  RadioGroup,
  RadioGroupCustomItem,
  TextArea,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  BigQueryCredentialsWithLocation,
  CheckBigQueryCredentials,
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  CheckBigQueryCredentialsSchema,
  isConnectorsAPIError,
} from "@dust-tt/types";
import { isRight } from "fp-ts/lib/Either";
import { formatValidationErrors } from "io-ts-reporters";
import React, { useEffect, useMemo, useState } from "react";

import type { ConnectorProviderConfiguration } from "@app/lib/connector_providers";
import { useBigQueryLocations } from "@app/lib/swr/bigquery";
import type { PostCredentialsBody } from "@app/pages/api/w/[wId]/credentials";

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
  }

  const createBigQueryConnection = async () => {
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
      return;
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
      return;
    }

    const createdManagedDataSource: {
      dataSource: DataSourceType;
      connector: ConnectorType;
    } = await createDataSourceRes.json();

    onSuccess(createdManagedDataSource.dataSource);
    setIsLoading(false);
  };

  const updateBigQueryConnection = async () => {
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
          `Failed to update BigQuery connection: ${maybeConnectorsError.message}`
        );
      } else {
        setError(`Failed to update BigQuery connection: ${err.error.message}`);
      }

      return;
    }

    onSuccess(dataSourceToUpdate);
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

            <Page.SectionHeader title="BigQuery Credentials" />

            {error && (
              <div className="w-full rounded-md bg-red-100 p-4 text-red-800">
                {error}
              </div>
            )}

            <div className="w-full space-y-4">
              <TextArea
                className="min-h-[325px]"
                name="service_account_json"
                value={credentials}
                placeholder="paste the content of your service account JSON here"
                onChange={(e) => {
                  setCredentials(e.target.value);
                }}
              />
            </div>

            {needToSelectLocation && (
              <div className="flex flex-col gap-y-4">
                <div className="text-sm font-medium text-element-800">
                  Select a location
                </div>
                <RadioGroup
                  value={selectedLocation}
                  onValueChange={setSelectedLocation}
                >
                  <div className="flex flex-col items-start gap-y-2">
                    {Object.entries(locations).map(([location, tables]) => (
                      <RadioGroupCustomItem
                        key={location}
                        id={location}
                        value={location}
                        customItem={
                          <Tooltip
                            label={
                              <Label htmlFor={location}>
                                This location contains {tables.length} tables
                                that can be connected :{" "}
                                <span className="text-xs text-gray-500">
                                  {tables.join(", ")}
                                </span>
                              </Label>
                            }
                            trigger={
                              <div className="flex items-center gap-1">
                                <b>{location}</b> - {tables.length} tables{" "}
                                <InformationCircleIcon />
                              </div>
                            }
                          />
                        }
                      />
                    ))}
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="flex justify-center pt-2">
              <div className="flex gap-2">
                <Button
                  variant="highlight"
                  size="md"
                  icon={CloudArrowLeftRightIcon}
                  onClick={() => {
                    setIsLoading(true);
                    if (dataSourceToUpdate) {
                      void updateBigQueryConnection();
                    } else {
                      void createBigQueryConnection();
                    }
                  }}
                  disabled={
                    isLoading ||
                    isLocationsLoading ||
                    !credentialsState.valid ||
                    !selectedLocation
                  }
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
