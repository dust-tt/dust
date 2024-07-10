import {
  Button,
  ContentMessage,
  DropdownMenu,
  Input,
  Modal,
  Page,
  RadioButton,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  CrawlingFrequency,
  DataSourceType,
  DepthOption,
  SubscriptionType,
  UpdateConnectorConfigurationType,
  WebCrawlerConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import type { APIError } from "@dust-tt/types";
import {
  CrawlingFrequencies,
  DepthOptions,
  isDataSourceNameValid,
  WEBCRAWLER_MAX_PAGES,
} from "@dust-tt/types";
import type * as t from "io-ts";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { useSWRConfig } from "swr";

import { DeleteDataSourceDialog } from "@app/components/data_source/DeleteDataSourceDialog";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { isUrlValid, urlToDataSourceName } from "@app/lib/webcrawler";
import type { PostManagedDataSourceRequestBodySchema } from "@app/pages/api/w/[wId]/data_sources/managed";

export default function WebsiteConfiguration({
  owner,
  subscription,
  dataSources,
  dataSource,
  gaTrackingId,
  webCrawlerConfiguration,
  dataSourceUsage,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  webCrawlerConfiguration: WebCrawlerConfigurationType | null;
  dataSource: DataSourceType | null;
  gaTrackingId: string;
  dataSourceUsage?: number;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [dataSourceUrl, setDataSourceUrl] = useState(
    webCrawlerConfiguration?.url || ""
  );
  const [dataSourceUrlError, setDataSourceUrlError] = useState<string | null>(
    null
  );

  const [dataSourceName, setDataSourceName] = useState(dataSource?.name || "");
  const [dataSourceNameError, setDataSourceNameError] = useState<string | null>(
    null
  );

  const [maxPages, setMaxPages] = useState<number | null>(
    webCrawlerConfiguration?.maxPageToCrawl || 50
  );
  const [maxDepth, setMaxDepth] = useState<DepthOption>(
    webCrawlerConfiguration ? webCrawlerConfiguration.depth : 2
  );
  const [crawlMode, setCrawlMode] = useState<"child" | "website">(
    webCrawlerConfiguration?.crawlMode || "website"
  );
  const [selectedCrawlFrequency, setSelectedCrawlFrequency] =
    useState<CrawlingFrequency>(
      webCrawlerConfiguration?.crawlFrequency || "monthly"
    );
  const [advancedSettingsOpened, setAdvancedSettingsOpened] = useState(false);

  const existingHeaders = webCrawlerConfiguration?.headers
    ? Object.entries(webCrawlerConfiguration.headers).map(([key, value]) => {
        return { key, value };
      })
    : [];
  const [headers, setHeaders] = useState(existingHeaders);

  const { mutate } = useSWRConfig();

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
    if (isUrlValid(dataSourceUrl)) {
      setDataSourceName(urlToDataSourceName(dataSourceUrl));
    }
  }, [dataSourceUrl]);

  const validateForm = useCallback(() => {
    let urlError = null;
    let nameError = null;

    // Validate URL
    if (!isUrlValid(dataSourceUrl)) {
      urlError =
        "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c)).";
    }

    // Validate Name
    const nameExists = dataSources.some(
      (d) => d.name === dataSourceName && d.id !== dataSource?.id
    );
    const dataSourceNameRes = isDataSourceNameValid(dataSourceName);
    if (nameExists) {
      nameError = "A Folder with the same name already exists";
    } else if (!dataSourceName.length) {
      nameError = "Please provide a name.";
    } else if (dataSourceNameRes.isErr()) {
      nameError = dataSourceNameRes.error;
    }

    setDataSourceUrlError(urlError);
    setDataSourceNameError(nameError);
    return !urlError && !nameError;
  }, [dataSourceName, dataSources, dataSourceUrl, dataSource?.id]);

  useEffect(() => {
    if (isSubmitted) {
      validateForm();
    }
  }, [dataSourceName, dataSourceUrl, isSubmitted, validateForm]);

  const router = useRouter();

  const handleCreate = async () => {
    setIsSubmitted(true);

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    if (webCrawlerConfiguration === null) {
      const sanitizedDataSourceUrl = dataSourceUrl.trim();
      const res = await fetch(`/api/w/${owner.sId}/data_sources/managed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "webcrawler",
          connectionId: "none",
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
        } satisfies t.TypeOf<typeof PostManagedDataSourceRequestBodySchema>),
      });
      if (res.ok) {
        await router.push(`/w/${owner.sId}/builder/data-sources/public-urls`);
      } else {
        const err = (await res.json()) as { error: APIError };
        setIsSaving(false);
        window.alert(`Error creating DataSource: ${err.error.message}`);
      }
    } else if (dataSource) {
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${encodeURIComponent(
          dataSource.name
        )}/configuration`,
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
        await router.push(`/w/${owner.sId}/builder/data-sources/public-urls`);
      } else {
        const err = (await res.json()) as { error: APIError };
        setIsSaving(false);
        window.alert(`Error creating DataSource: ${err.error.message}`);
      }
    }
  };

  const handleDelete = async () => {
    if (!dataSource) {
      return;
    }
    setIsSaving(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${encodeURIComponent(dataSource.name)}`,
      {
        method: "DELETE",
      }
    );
    setIsSaving(false);
    if (res.ok) {
      await mutate(`/api/w/${owner.sId}/data_sources`);
      await router.push(`/w/${owner.sId}/builder/data-sources/public-urls`);
    } else {
      const err = (await res.json()) as { error: APIError };
      window.alert(
        `Failed to delete the Website (contact team@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
      );
    }
    return true;
  };

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title={webCrawlerConfiguration ? "Edit Website" : "Add a Website"}
          onSave={() => {
            setIsSubmitted(true);
            if (!isSaving) {
              void handleCreate();
            }
          }}
          onCancel={() => {
            void router.push(
              `/w/${owner.sId}/builder/data-sources/public-urls`
            );
          }}
        />
      }
      hideSidebar={true}
    >
      <Modal
        isOpen={advancedSettingsOpened}
        title={`Advanced settings`}
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
                    const newHeaders = headers.filter((_, i) => i !== index);
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
      <div className="flex flex-col gap-2 py-8">
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
            <ContentMessage title="Ensure the website is public" variant="pink">
              Only public websites accessible without authentication will work.
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
                    <DropdownMenu.Button label={depthDisplayText[maxDepth]} />
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
            <Page.P>Give a name to this Data Source.</Page.P>
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

          <div className="flex">
            <Button
              label="Advanced settings"
              variant="secondary"
              onClick={() => {
                setAdvancedSettingsOpened(true);
              }}
            ></Button>
          </div>
          {webCrawlerConfiguration && (
            <div className="flex py-16">
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
                setIsOpen={setIsDeleteModalOpen}
                dataSourceUsage={dataSourceUsage ?? 0}
              />
            </div>
          )}
        </Page.Layout>
      </div>
    </AppLayout>
  );
}
