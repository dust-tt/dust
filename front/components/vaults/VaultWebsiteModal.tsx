import {
  Button,
  ContentMessage,
  DropdownMenu,
  ExclamationCircleStrokeIcon,
  Input,
  Modal,
  Page,
  RadioButton,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  APIError,
  CrawlingFrequency,
  DataSourceType,
  DataSourceViewCategory,
  DataSourceViewType,
  DepthOption,
  VaultType,
} from "@dust-tt/types";
import type {
  UpdateConnectorConfigurationType,
  WebCrawlerConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  CrawlingFrequencies,
  DepthOptions,
  isDataSourceNameValid,
  WEBCRAWLER_DEFAULT_CONFIGURATION,
  WEBCRAWLER_MAX_PAGES,
} from "@dust-tt/types";
import type * as t from "io-ts";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import React from "react";

import { DeleteDataSourceDialog } from "@app/components/data_source/DeleteDataSourceDialog";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useVaultDataSourceViews } from "@app/lib/swr/vaults";
import { isUrlValid, urlToDataSourceName } from "@app/lib/webcrawler";
import type {
  PostDataSourceWithProviderRequestBodySchema,
  PostVaultDataSourceResponseBody,
} from "@app/pages/api/w/[wId]/vaults/[vId]/data_sources";

const WEBSITE_CAT: DataSourceViewCategory = "website";

// todo(GROUPS_INFRA): current component has been mostly copy pasted from the WebsiteConfiguration existing component
// this should be refactored to use the new design.
export default function VaultWebsiteModal({
  isOpen,
  onClose,
  owner,
  dataSources,
  vault,
  dataSourceView,
  webCrawlerConfiguration,
}: {
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  vault: VaultType;
  dataSources: DataSourceType[];
  dataSourceView: DataSourceViewType | null;
  webCrawlerConfiguration: WebCrawlerConfigurationType | null;
}) {
  useEffect(() => {
    setDataSourceUrl(
      webCrawlerConfiguration ? webCrawlerConfiguration.url : ""
    );
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
    console.log(dataSourceView);
    setHeaders(
      webCrawlerConfiguration
        ? Object.entries(webCrawlerConfiguration.headers).map(
            ([key, value]) => ({ key, value })
          )
        : []
    );
  }, [dataSourceView, webCrawlerConfiguration]);

  const router = useRouter();
  const sendNotification = React.useContext(SendNotificationsContext);

  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [dataSourceUrl, setDataSourceUrl] = useState("");
  const [dataSourceUrlError, setDataSourceUrlError] = useState<string | null>(
    null
  );

  // TODO(DATASOURCE_SID): Move to dataSourceId = ... dataSourceView.dataSource.sId
  const dsName = dataSourceView ? dataSourceView.dataSource.name : null;

  const [dataSourceName, setDataSourceName] = useState("");
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

  const { mutateVaultDataSourceViews } = useVaultDataSourceViews({
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

  useEffect(() => {
    if (isUrlValid(dataSourceUrl) && !dataSourceView) {
      setDataSourceName(urlToDataSourceName(dataSourceUrl));
    }
  }, [dataSourceUrl, dataSourceView]);

  const validateForm = useCallback(() => {
    console.log(dataSourceView);
    let urlError = null;
    let nameError = null;

    // Validate URL
    if (!isUrlValid(dataSourceUrl)) {
      urlError =
        "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c)).";
    }

    // Validate Name
    const nameExists = dataSources.some(
      // TODO(DATASOURCE_SID): This line was kind of buggy because dataSourceId and sId was name but
      // dataSourceId was not defined when it mattered (creation) and this not used during patching.
      // (currently replacing back to .name the real real value for now showing that the line makes
      // no sense). Will move to sId in subsequent PR.
      (d) => d.name === dataSourceName && d.name !== dsName
    );
    const dataSourceNameRes = isDataSourceNameValid(dataSourceName);
    if (nameExists) {
      nameError = "A Website with the same name already exists";
    } else if (!dataSourceName.length) {
      nameError = "Please provide a name.";
    } else if (dataSourceNameRes.isErr()) {
      nameError = dataSourceNameRes.error;
    }

    setDataSourceUrlError(urlError);
    setDataSourceNameError(nameError);
    return !urlError && !nameError;
  }, [dataSourceView, dataSourceUrl, dataSources, dataSourceName, dsName]);

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
    if (webCrawlerConfiguration === null) {
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
      if (res.ok) {
        onClose();
        sendNotification({
          title: "Website created",
          type: "success",
          description: "The website has been successfully created.",
        });
        await mutateVaultDataSourceViews();
        setIsSaving(false);
        const response: PostVaultDataSourceResponseBody = await res.json();
        const { dataSourceView } = response;
        await router.push(
          `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${WEBSITE_CAT}/data_source_views/${dataSourceView.sId}`
        );
      } else {
        const err: { error: APIError } = await res.json();
        setIsSaving(false);
        sendNotification({
          title: "Error creating website",
          type: "error",
          description: err.error.message,
        });
      }
    } else if (dataSourceView) {
      const res = await fetch(
        `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources/${dsName}/configuration`,
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
      if (res.ok) {
        onClose();
        setIsSaving(false);
        sendNotification({
          title: "Website updated",
          type: "success",
          description: "The website has been successfully updated.",
        });
        await mutateVaultDataSourceViews();
      } else {
        const err = (await res.json()) as { error: APIError };
        setIsSaving(false);
        sendNotification({
          title: "Error creating website",
          type: "error",
          description: err.error.message,
        });
      }
    }
  };

  const handleDelete = async () => {
    if (!dsName) {
      return;
    }
    setIsSaving(true);
    const res = await fetch(
      `/api/w/${owner.sId}/vaults/${vault.sId}/data_sources/${dsName}`,
      {
        method: "DELETE",
      }
    );
    setIsSaving(false);
    if (res.ok) {
      await mutateVaultDataSourceViews();
      await router.push(
        `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${WEBSITE_CAT}`
      );
    } else {
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        title: "Error deleting website",
        type: "error",
        description: err.error.message,
      });
    }
    return true;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSave={() => {
        setIsSubmitted(true);
        if (!isSaving) {
          void handleCreate();
        }
      }}
      hasChanged={true}
      variant="side-md"
      title="Create a website"
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
            <Page.Layout direction="vertical" gap="md">
              <Page.H variant="h3">Custom Headers</Page.H>
              <Page.P>Add custom request headers for the web crawler.</Page.P>
              <div className="flex flex-col gap-1 px-1">
                {headers.map((header, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="Header Name"
                      value={header.key}
                      name="headerName"
                      onChange={(value) => {
                        const newHeaders = [...headers];
                        newHeaders[index].key = value;
                        setHeaders(newHeaders);
                      }}
                      className="flex-1"
                    />
                    <Input
                      name="headerValue"
                      placeholder="Header Value"
                      value={header.value}
                      onChange={(value) => {
                        const newHeaders = [...headers];
                        newHeaders[index].value = value;
                        setHeaders(newHeaders);
                      }}
                      className="flex-1"
                    />
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
          </Modal>
          <div className="flex flex-col gap-2">
            <Page.Layout direction="vertical" gap="xl">
              <Page.Layout direction="vertical" gap="md">
                <Page.H variant="h3">Website Entry Point</Page.H>
                <Page.P>
                  Enter the address of the website you'd like to index.
                </Page.P>
                <Input
                  placeholder="https://example.com/articles"
                  value={dataSourceUrl}
                  onChange={(value) => setDataSourceUrl(value)}
                  error={dataSourceUrlError}
                  name="dataSourceUrl"
                  showErrorLabel={true}
                  className="text-sm"
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
                  <div>
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
                  </div>
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
                    onChange={(value) => {
                      const parsed = parseInt(value);
                      if (!isNaN(parsed)) {
                        setMaxPages(parseInt(value));
                      } else if (value == "") {
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
                  <Page.P>Give a name to this Data Source.</Page.P>
                ) : (
                  <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                    <ExclamationCircleStrokeIcon />
                    Website name cannot be changed.
                  </p>
                )}
                <Input
                  placeholder=""
                  value={dataSourceName}
                  onChange={(value) => setDataSourceName(value)}
                  error={dataSourceNameError}
                  name="dataSourceName"
                  showErrorLabel={true}
                  className="text-sm"
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
                ></Button>
                {webCrawlerConfiguration && dsName && (
                  <>
                    <Button
                      variant="secondaryWarning"
                      icon={TrashIcon}
                      label={"Delete this website"}
                      onClick={() => {
                        setIsDeleteModalOpen(true);
                      }}
                    />
                    <DeleteDataSourceDialog
                      handleDelete={handleDelete}
                      isOpen={isDeleteModalOpen}
                      onClose={() => setIsDeleteModalOpen(false)}
                    />
                  </>
                )}
              </div>
            </Page.Layout>
          </div>
        </div>
      </div>
    </Modal>
  );
}
