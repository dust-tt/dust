// Okay to use public API types because it's front/connectors communication.

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFormatErrorDescription } from "@app/hooks/useFormatErrorDescription";
import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import type { ConnectorProviderConfiguration } from "@app/lib/connector_providers";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import { clientFetch } from "@app/lib/egress/client";
import { useBigQueryLocations } from "@app/lib/swr/bigquery";
import type { PostCredentialsBody } from "@app/types/api/oauth";
import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
} from "@app/types/data_source";
import type {
  BigQueryCredentialsWithLocation,
  CheckBigQueryCredentials,
} from "@app/types/oauth/lib";
import { CheckBigQueryCredentialsSchema } from "@app/types/oauth/lib";
import type { WorkspaceType } from "@app/types/user";
// oxlint-disable-next-line dust/enforceClientTypesInPublicApi -- existing usage
import { isConnectorsAPIError } from "@dust-tt/client";
import {
  BookOpen01,
  Button,
  ContentMessage,
  Icon,
  InfoCircle,
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
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useState } from "react";

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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const formatErrorDescription = useFormatErrorDescription();
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
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
      const r = CheckBigQueryCredentialsSchema.safeParse(credentialsObject);
      if (r.success) {
        const allFieldsHaveValue = Object.values(credentialsObject).every(
          (v) => v.length > 0
        );
        return {
          credentials: credentialsObject,
          valid: allFieldsHaveValue,
          errorMessage: !allFieldsHaveValue
            ? t`All fields must have a value`
            : null,
        };
      } else {
        const fields = r.error.issues
          .map((issue) => issue.path.join("."))
          .filter((path) => path.length > 0)
          .join(", ");
        return {
          credentials: credentialsObject,
          valid: false,
          errorMessage: fields
            ? t`Missing or invalid fields: ${fields}.`
            : t`The service account JSON must be an object.`,
        };
      }
    } catch {
      return {
        credentials: null,
        valid: false,
        errorMessage: t`Invalid JSON`,
      };
    }
  }, [credentials, t]);

  // Region picking
  const [selectedLocation, setSelectedLocation] = useState<string>();
  const {
    locations,
    isLocationsLoading,
    error: locationsError,
  } = useBigQueryLocations({
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

  // Checks re-run as the credentials are typed, so they stay inline instead of being toasted.
  let credentialsError: string | null = credentialsState.errorMessage;
  if (!credentialsError && locationsError) {
    credentialsError = formatErrorDescription(locationsError);
  }
  if (!credentialsError && locations && Object.keys(locations).length === 0) {
    credentialsError = t`No locations found - make sure you follow the instructions in the guide.`;
  }

  if (connectorProviderConfiguration.connectorProvider !== "bigquery") {
    // Should never happen.
    return null;
  }

  const connectorUIConfiguration =
    CONNECTOR_UI_CONFIGURATIONS[
      connectorProviderConfiguration.connectorProvider
    ];

  const providerName = connectorProviderConfiguration.name;

  function onSuccess(ds: DataSourceType) {
    setCredentials("");
    _onSuccess(ds);
  }

  const createBigQueryConnection = async (): Promise<boolean> => {
    if (!onSuccess || !createDatasource) {
      // Should never happen.
      throw new Error("onCreated and createDatasource are required");
    }

    setIsLoading(true);

    // First we post the credentials to OAuth service.
    const createCredentialsRes = await clientFetch(
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
      sendApiErrorNotification({
        title: t`Failed to create BigQuery connection`,
        error: await createCredentialsRes.json(),
      });
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

      sendApiErrorNotification({
        title: t`Failed to create BigQuery connection`,
        // A rejected configuration is explained by the connectors error, not the front one.
        error:
          isConnectorsAPIError(maybeConnectorsError) &&
          maybeConnectorsError.type === "invalid_request_error"
            ? maybeConnectorsError
            : err,
      });

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
    const credentialsRes = await clientFetch(
      `/api/w/${owner.sId}/credentials`,
      {
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
      }
    );

    if (!credentialsRes.ok) {
      sendApiErrorNotification({
        title: t`Failed to update BigQuery connection`,
        error: await credentialsRes.json(),
      });
      setIsLoading(false);
      return false;
    }

    const data = await credentialsRes.json();

    const updateConnectorRes = await clientFetch(
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

      sendApiErrorNotification({
        title: t`Failed to update BigQuery connection`,
        // A rejected configuration is explained by the connectors error, not the front one.
        error:
          isConnectorsAPIError(maybeConnectorsError) &&
          maybeConnectorsError.type === "invalid_request_error"
            ? maybeConnectorsError
            : err,
      });

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
                visual={connectorUIConfiguration.getLogoComponent(isDark)}
              />
            </span>
            <Trans>Connecting {providerName}</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <Button
                label={t`Read our guide`}
                size="sm"
                href={connectorUIConfiguration.guideLink ?? ""}
                variant="outline"
                target="_blank"
                rel="noopener noreferrer"
                icon={BookOpen01}
              />

              {connectorUIConfiguration.limitations && (
                <ContentMessage
                  variant="primary"
                  title={t`Limitations`}
                  className="border-none"
                >
                  {t(connectorUIConfiguration.limitations)}
                </ContentMessage>
              )}
            </div>

            {credentialsError && (
              <ContentMessage variant="warning" title={t`Connection error`}>
                {credentialsError}
              </ContentMessage>
            )}

            <Page.SectionHeader title={t`BigQuery credentials`} />
            <TextArea
              className="min-h-[300px] font-mono text-[13px]"
              name="service_account_json"
              value={credentials}
              placeholder={t`Paste service account JSON here`}
              onChange={(e) => setCredentials(e.target.value)}
            />

            {needToSelectLocation && (
              <div className="flex flex-col gap-4">
                <Page.SectionHeader title={t`Select location`} />
                <RadioGroup
                  value={selectedLocation}
                  onValueChange={setSelectedLocation}
                >
                  {Object.entries(locations ?? {}).map(([location, tables]) => {
                    const tableExamples = tables.join(", ");
                    const tableCount = tables.length;
                    return (
                      <RadioGroupCustomItem
                        key={location}
                        id={location}
                        value={location}
                        customItem={
                          <Tooltip
                            label={
                              <Trans>
                                This location contains connectable tables, for
                                example:{" "}
                                <span className="text-xs text-muted-foreground">
                                  {tableExamples}
                                </span>
                              </Trans>
                            }
                            trigger={
                              <Label
                                htmlFor={location}
                                className="flex cursor-pointer items-center gap-1"
                              >
                                <span className="font-semibold">
                                  {location}
                                </span>{" "}
                                -{" "}
                                <Plural
                                  value={tableCount}
                                  one="# table"
                                  other="# tables"
                                />{" "}
                                <InfoCircle />
                              </Label>
                            }
                          />
                        }
                      />
                    );
                  })}
                </RadioGroup>
              </div>
            )}
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: isLoading ? t`Saving...` : t`Save`,
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
