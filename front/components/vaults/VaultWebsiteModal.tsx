import {
  Button,
  ContentMessage,
  DropdownMenu,
  ExclamationCircleStrokeIcon,
  Input,
  Label,
  Modal,
  Page,
  RadioButton,
  Spinner,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  APIError,
  CrawlingFrequency,
  DataSourceType,
  DataSourceViewType,
  DepthOption,
  UpdateConnectorConfigurationType,
  VaultType,
  WebCrawlerConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  CrawlingFrequencies,
  DepthOptions,
  isDataSourceNameValid,
  isWebCrawlerConfiguration,
  WEBCRAWLER_DEFAULT_CONFIGURATION,
  WEBCRAWLER_MAX_PAGES,
} from "@dust-tt/types";
import type * as t from "io-ts";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useDataSourceViewConnectorConfiguration } from "@app/lib/swr/data_source_views";
import { useVaultDataSourceViews } from "@app/lib/swr/vaults";
import { isUrlValid, urlToDataSourceName } from "@app/lib/webcrawler";
import type { PostDataSourceWithProviderRequestBodySchema } from "@app/pages/api/w/[wId]/vaults/[vId]/data_sources";

const WEBSITE_CAT = "website";

// todo(GROUPS_INFRA): current component has been mostly copy pasted from the WebsiteConfiguration existing component
// this should be refactored to use the new design.
export default function VaultWebsiteModal({
  isOpen,
  onClose,
  owner,
  dataSources,
  vault,
  dataSourceView,
}: {
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  vault: VaultType;
  dataSources: DataSourceType[];
  dataSourceView: DataSourceViewType | null;
}) {
  const router = useRouter();
  const sendNotification = React.useContext(SendNotificationsContext);

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [dataSourceUrl, setDataSourceUrl] = useState("");
  const [dataSourceUrlError, setDataSourceUrlError] = useState<string | null>(
    null
  );

  const [dataSourceName, setDataSourceName] = useState(
    dataSourceView ? dataSourceView.dataSource.name : ""
  );

  const [dataSourceNameError, setDataSourceNameError] = useState<string | null>(
    null
  );

  const [maxPages, setMaxPages] = useState<number | null>(
    WEBCRAWLER_DEFAULT_CONFIGURATION.maxPageToCrawl
  );
  const [maxDepth, setMaxDepth] = useState<DepthOption>(
    WEBCRAWLER_DEFAULT_CONFIGURATION.depth
  );
  const [crawlMode, setCrawlMode] = useState<"child" | "website">(
    WEBCRAWLER_DEFAULT_CONFIGURATION.crawlMode
  );
  const [selectedCrawlFrequency, setSelectedCrawlFrequency] =
    useState<CrawlingFrequency>(
      WEBCRAWLER_DEFAULT_CONFIGURATION.crawlFrequency
    );
  const [advancedSettingsOpened, setAdvancedSettingsOpened] = useState(false);
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);

  const { configuration, mutateConfiguration, isConfigurationLoading } =
    useDataSourceViewConnectorConfiguration({
      dataSourceView,
      owner,
    });

  let webCrawlerConfiguration: WebCrawlerConfigurationType | null = null;
  if (isWebCrawlerConfiguration(configuration)) {
    webCrawlerConfiguration = configuration;
  }

  useEffect(() => {
    setIsSubmitted(false);
    setIsSaving(false);

    if (isOpen) {
      setDataSourceUrl(
        webCrawlerConfiguration ? webCrawlerConfiguration.url : ""
      );

      setDataSourceUrlError(null);
      setMaxPages(
        webCrawlerConfiguration
          ? webCrawlerConfiguration.maxPageToCrawl
          : WEBCRAWLER_DEFAULT_CONFIGURATION.maxPageToCrawl
      );
      setMaxDepth(
        webCrawlerConfiguration
          ? webCrawlerConfiguration.depth
          : WEBCRAWLER_DEFAULT_CONFIGURATION.depth
      );
      setCrawlMode(
        webCrawlerConfiguration
          ? webCrawlerConfiguration.crawlMode
          : WEBCRAWLER_DEFAULT_CONFIGURATION.crawlMode
      );
      setSelectedCrawlFrequency(
        webCrawlerConfiguration
          ? webCrawlerConfiguration.crawlFrequency
          : WEBCRAWLER_DEFAULT_CONFIGURATION.crawlFrequency
      );
      setDataSourceName(dataSourceView ? dataSourceView.dataSource.name : "");
      setDataSourceNameError(null);
      setHeaders(
        webCrawlerConfiguration
          ? Object.entries(webCrawlerConfiguration.headers).map(
              ([key, value]) => ({ key, value })
            )
          : []
      );
    }
  }, [isOpen, dataSourceView, webCrawlerConfiguration]);

  const { mutateRegardlessOfQueryParams: mutateVaultDataSourceViews } =
    useVaultDataSourceViews({
      workspaceId: owner.sId,
      vaultId: vault.sId,
      category: WEBSITE_CAT,
    });

  const frequencyDisplayText: Record<CrawlingFrequency, string> = {
    never: "Never",
    daily: "Every day",
    weekly: "Every week",
    monthly: "Every month",
  };

  const depthDisplayText: Record<DepthOption, string> = {
    0: "0 level",
    1: "1 level",
    2: "2 levels",
    3: "3 levels",
    4: "4 levels",
    5: "5 levels",
  };

  const updateUrl = (url: string) => {
    setDataSourceUrl(url);
    if (isUrlValid(dataSourceUrl) && !dataSourceView) {
      setDataSourceName(urlToDataSourceName(dataSourceUrl));
    }
  };

  const validateForm = useCallback(() => {
    let urlError = null;
    let nameError = null;

    // Validate URL
    if (!isUrlValid(dataSourceUrl)) {
      urlError =
        "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c)).";
    }

    // Validate Name (if it's not edition)
    if (!webCrawlerConfiguration) {
      const nameExists = dataSources.some(
        (d) =>
          d.name === dataSourceName && d.sId !== dataSourceView?.dataSource.sId
      );
      const dataSourceNameRes = isDataSourceNameValid(dataSourceName);
      if (nameExists) {
        nameError = "A Website with the same name already exists";
      } else if (!dataSourceName.length) {
        nameError = "Please provide a name.";
      } else if (dataSourceNameRes.isErr()) {
        nameError = dataSourceNameRes.error;
      }
    }

    setDataSourceUrlError(urlError);
    setDataSourceNameError(nameError);
    return !urlError && !nameError;
  }, [
    dataSourceUrl,
    dataSources,
    dataSourceName,
    dataSourceView?.dataSource.sId,
    webCrawlerConfiguration,
  ]);

  useEffect(() => {
    if (isSubmitted) {
      validateForm();
    }
  }, [dataSourceName, dataSourceUrl, isSubmitted, validateForm]);

  const handleCreate = async () => {
    setIsSubmitted(true);

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    const sanitizedDataSourceUrl = dataSourceUrl.trim();
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "webcrawler",
          name: dataSourceName,
          configuration: {
            url: sanitizedDataSourceUrl,
            maxPageToCrawl: maxPages || WEBCRAWLER_MAX_PAGES,
            depth: maxDepth,
            crawlMode: crawlMode,
            crawlFrequency: selectedCrawlFrequency,
            headers: headers.reduce(
              (acc, { key, value }) => {
                if (key && value) {
                  acc[key] = value;
                }
                return acc;
              },
              {} as Record<string, string>
            ),
          } satisfies WebCrawlerConfigurationType,
        } satisfies t.TypeOf<
          typeof PostDataSourceWithProviderRequestBodySchema
        >),
      }
    );

    await handleResponse(res, "created");
  };

  const handleUpdate = async () => {
    setIsSubmitted(true);

    if (!validateForm || !dataSourceView) {
      return;
    }

    setIsSaving(true);
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources/${dataSourceView.dataSource.sId}/configuration`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          configuration: {
            url: dataSourceUrl,
            maxPageToCrawl: maxPages || WEBCRAWLER_MAX_PAGES,
            depth: maxDepth,
            crawlMode: crawlMode,
            crawlFrequency: selectedCrawlFrequency,
            headers: headers.reduce(
              (acc, { key, value }) => {
                if (key && value) {
                  acc[key] = value;
                }
                return acc;
              },
              {} as Record<string, string>
            ),
          } satisfies WebCrawlerConfigurationType,
        } satisfies UpdateConnectorConfigurationType),
      }
    );
    void mutateConfiguration();

    await handleResponse(res, "updated");
  };

  const handleResponse = async (
    res: Response,
    action: "created" | "updated"
  ) => {
    if (res.ok) {
      onClose();
      sendNotification({
        title: `Website ${action}`,
        type: "success",
        description: `The website has been successfully ${action}.`,
      });
      void mutateVaultDataSourceViews();
      setIsSaving(false);
    } else {
      const err: { error: APIError } = await res.json();
      setIsSaving(false);
      sendNotification({
        title: `Error ${action === "created" ? "creating" : "updating"} website`,
        type: "error",
        description: err.error.message,
      });
    }
  };

  const handleDelete = async () => {
    if (!dataSourceView) {
      return;
    }
    setIsSaving(true);
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources/${dataSourceView.dataSource.sId}`,
      {
        method: "DELETE",
      }
    );
    setIsSaving(false);
    if (res.ok) {
      void mutateVaultDataSourceViews();
      await router.push(
        `/w/${owner.sId}/vaults/${vault.sId}/categories/${WEBSITE_CAT}`
      );
      onClose();
    } else {
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        title: "Error deleting website",
        type: "error",
        description: err.error.message,
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSave={() => {
        setIsSubmitted(true);
        if (!isSaving) {
          if (dataSourceView) {
            void handleUpdate();
          } else {
            void handleCreate();
          }
        }
      }}
      hasChanged={true}
      variant="side-md"
      title={
        dataSourceView
          ? `Edit ${dataSourceView.dataSource.name}`
          : "Create a website"
      }
    >
      <div className="w-full pt-6">
        <div className="overflow-x-auto">
          <Modal
            isOpen={advancedSettingsOpened}
            title="Advanced settings"
            onClose={() => {
              setAdvancedSettingsOpened(false);
            }}
            hasChanged={false}
            isSaving={false}
            variant="side-sm"
          >
            <div className="w-full pt-6">
              <Page.Layout direction="vertical" gap="xl">
                <Page.H variant="h3">Custom Headers</Page.H>
                <Page.P>Add custom request headers for the web crawler.</Page.P>
                <div className="flex flex-col gap-4">
                  {headers.map((header, index) => (
                    <div key={index} className="flex gap-2">
                      <div className="flex grow flex-col gap-1">
                        <Input
                          placeholder="Header Name"
                          value={header.key}
                          name="headerName"
                          onChange={(e) => {
                            const newHeaders = [...headers];
                            newHeaders[index].key = e.target.value;
                            setHeaders(newHeaders);
                          }}
                          className="grow"
                        />
                        <Input
                          name="headerValue"
                          placeholder="Header Value"
                          value={header.value}
                          onChange={(e) => {
                            const newHeaders = [...headers];
                            newHeaders[index].value = e.target.value;
                            setHeaders(newHeaders);
                          }}
                          className="flex-1"
                        />
                      </div>
                      <Button
                        variant="tertiary"
                        labelVisible={false}
                        label=""
                        icon={XMarkIcon}
                        disabledTooltip={true}
                        onClick={() => {
                          const newHeaders = headers.filter(
                            (_, i) => i !== index
                          );
                          setHeaders(newHeaders);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex">
                  <Button
                    variant="secondary"
                    className="shrink"
                    label="Add Header"
                    onClick={() => {
                      setHeaders([...headers, { key: "", value: "" }]);
                    }}
                  />
                </div>
              </Page.Layout>
            </div>
          </Modal>
          <div className="flex flex-col gap-2">
            {isConfigurationLoading ? (
              <Spinner />
            ) : (
              <Page.Layout direction="vertical" gap="xl">
                <Page.Layout direction="vertical" gap="md">
                  <Page.H variant="h3">Website Entry Point</Page.H>
                  <Label className="pl-1">
                    Enter the address of the website you'd like to index.
                  </Label>
                  <Input
                    placeholder="https://example.com/articles"
                    value={dataSourceUrl}
                    onChange={(e) => updateUrl(e.target.value)}
                    error={dataSourceUrlError}
                    name="dataSourceUrl"
                    showErrorLabel
                  />
                  <ContentMessage
                    title="Ensure the website is public"
                    variant="pink"
                  >
                    Only public websites accessible without authentication will
                    work.
                  </ContentMessage>
                </Page.Layout>

                <Page.Layout direction="vertical" gap="md">
                  <Page.H variant="h3">Indexing settings</Page.H>
                  <Page.P>
                    Adjust the settings in order to only index the data you are
                    interested in.
                  </Page.P>
                </Page.Layout>
                <div className="grid grid-cols-2 gap-x-6 gap-y-8">
                  <Page.Layout direction="vertical" sizing="grow">
                    <Page.SectionHeader
                      title="Crawling strategy"
                      description="Do you want to limit to child pages or not?"
                    />
                    <RadioButton
                      value={crawlMode}
                      className="flex-col font-medium"
                      onChange={(value) => {
                        setCrawlMode(value == "child" ? "child" : "website");
                      }}
                      name="crawlMode"
                      choices={[
                        {
                          label: "Only child pages of the provided URL",
                          value: "child",
                          disabled: false,
                        },
                        {
                          label: "Follow all the links within the domain",
                          value: "website",
                          disabled: false,
                        },
                      ]}
                    />
                  </Page.Layout>
                  <Page.Layout direction="vertical" sizing="grow">
                    <Page.SectionHeader
                      title="Refresh schedule"
                      description="How often would you like to check for updates?"
                    />
                    {(() => {
                      return (
                        <DropdownMenu>
                          <DropdownMenu.Button
                            label={frequencyDisplayText[selectedCrawlFrequency]}
                          />
                          <DropdownMenu.Items origin="topLeft">
                            {CrawlingFrequencies.map((frequency) => {
                              return (
                                <DropdownMenu.Item
                                  selected={selectedCrawlFrequency == frequency}
                                  key={frequency}
                                  label={frequencyDisplayText[frequency]}
                                  onClick={() => {
                                    setSelectedCrawlFrequency(frequency);
                                  }}
                                />
                              );
                            })}
                          </DropdownMenu.Items>
                        </DropdownMenu>
                      );
                    })()}
                  </Page.Layout>
                  <Page.Layout direction="vertical" sizing="grow">
                    <Page.SectionHeader
                      title="Depth of Search"
                      description="How far from the initial page would you like to go?"
                    />
                    {(() => {
                      return (
                        <DropdownMenu>
                          <DropdownMenu.Button
                            label={depthDisplayText[maxDepth]}
                          />
                          <DropdownMenu.Items origin="bottomLeft">
                            {DepthOptions.map((depthOption) => {
                              return (
                                <DropdownMenu.Item
                                  selected={depthOption === maxDepth}
                                  key={depthOption}
                                  label={depthDisplayText[depthOption]}
                                  onClick={() => {
                                    setMaxDepth(depthOption);
                                  }}
                                />
                              );
                            })}
                          </DropdownMenu.Items>
                        </DropdownMenu>
                      );
                    })()}
                  </Page.Layout>
                  <Page.Layout direction="vertical" sizing="grow">
                    <Page.SectionHeader
                      title="Page Limit"
                      description="What is the maximum number of pages you'd like to index?"
                    />
                    <Input
                      placeholder={WEBCRAWLER_MAX_PAGES.toString()}
                      value={maxPages?.toString() || ""}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value);
                        if (!isNaN(parsed)) {
                          setMaxPages(parseInt(e.target.value));
                        } else if (e.target.value == "") {
                          setMaxPages(null);
                        }
                      }}
                      showErrorLabel={
                        maxPages &&
                        maxPages > WEBCRAWLER_MAX_PAGES &&
                        maxPages &&
                        maxPages < 1
                          ? false
                          : true
                      }
                      error={
                        (maxPages && maxPages > WEBCRAWLER_MAX_PAGES) ||
                        (maxPages && maxPages < 1)
                          ? `Maximum pages must be between 1 and ${WEBCRAWLER_MAX_PAGES}`
                          : null
                      }
                      name="maxPages"
                    />
                  </Page.Layout>
                </div>
                <Page.Layout direction="vertical" gap="md">
                  <Page.H variant="h3">Name</Page.H>
                  {webCrawlerConfiguration === null ? (
                    <Label className="pl-1">
                      Give a name to this Data Source.
                    </Label>
                  ) : (
                    <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                      <ExclamationCircleStrokeIcon />
                      Website name cannot be changed.
                    </p>
                  )}
                  <Input
                    value={dataSourceName}
                    onChange={(e) => setDataSourceName(e.target.value)}
                    error={dataSourceNameError}
                    name="dataSourceName"
                    showErrorLabel
                    placeholder="Articles"
                    disabled={webCrawlerConfiguration !== null}
                  />
                </Page.Layout>

                <div className="flex gap-6">
                  <Button
                    label="Advanced settings"
                    variant="secondary"
                    onClick={() => {
                      setAdvancedSettingsOpened(true);
                    }}
                    hasMagnifying={false}
                  ></Button>
                  {webCrawlerConfiguration && dataSourceView && (
                    <>
                      <Button
                        variant="secondaryWarning"
                        icon={TrashIcon}
                        label={"Delete this website"}
                        onClick={() => {
                          setIsDeleteModalOpen(true);
                        }}
                        hasMagnifying={false}
                      />
                      {dataSourceView && (
                        <DeleteStaticDataSourceDialog
                          owner={owner}
                          dataSource={dataSourceView.dataSource}
                          handleDelete={handleDelete}
                          isOpen={isDeleteModalOpen}
                          onClose={() => {
                            setIsDeleteModalOpen(false);
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
              </Page.Layout>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
