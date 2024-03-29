import {
  Button,
  ContentMessage,
  DropdownMenu,
  Input,
  Page,
  RadioButton,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  CrawlingFrequency,
  DataSourceType,
  DepthOption,
  SubscriptionType,
  UpdateConnectorRequestBodySchema,
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

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { isUrlValid, urlToDataSourceName } from "@app/lib/webcrawler";
import type { PostManagedDataSourceRequestBodySchema } from "@app/pages/api/w/[wId]/data_sources/managed";

export default function WebsiteConfiguration({
  owner,
  subscription,
  dataSources,
  dataSource,
  gaTrackingId,
  webCrawlerConfiguration,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  webCrawlerConfiguration: WebCrawlerConfigurationType | null;
  dataSource: DataSourceType | null;
  gaTrackingId: string;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [isValid, setIsValid] = useState(true);

  const [dataSourceUrl, setDataSourceUrl] = useState(
    webCrawlerConfiguration?.url || ""
  );
  const [dataSourceUrlError, setDataSourceUrlError] = useState("");

  const [dataSourceName, setDataSourceName] = useState(dataSource?.name || "");
  const [dataSourceNameError, setDataSourceNameError] = useState("");
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
    setDataSourceName(urlToDataSourceName(dataSourceUrl));
  }, [dataSourceUrl]);

  const formValidation = useCallback(() => {
    let valid = true;

    if (isUrlValid(dataSourceUrl)) {
      setDataSourceUrlError("");
    } else {
      if (dataSourceUrl.length > 0) {
        setDataSourceUrlError(
          "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))"
        );
      }
      valid = false;
    }

    let exists = false;
    dataSources.forEach((d) => {
      if (d.name == dataSourceName && d.id != dataSource?.id) {
        exists = true;
      }
    });

    if (exists) {
      setDataSourceNameError("A Folder with the same name already exists");
      valid = false;
    }
    const dataSourceNameRes = isDataSourceNameValid(dataSourceName);
    if (dataSourceNameRes.isErr()) {
      setDataSourceNameError(dataSourceNameRes.error);
      valid = false;
    } else {
      setDataSourceNameError("");
      valid = true;
    }

    setIsEdited(true);
    setIsValid(valid);
  }, [dataSourceName, dataSources, dataSourceUrl, dataSource?.id]);

  useEffect(() => {
    formValidation();
  }, [formValidation]);

  const router = useRouter();

  const handleCreate = async () => {
    setIsSaving(true);
    if (webCrawlerConfiguration === null) {
      const res = await fetch(`/api/w/${owner.sId}/data_sources/managed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urlConfig: {
            url: dataSourceUrl,
            maxPages: maxPages || WEBCRAWLER_MAX_PAGES,
            depth: maxDepth,
            crawlMode: crawlMode,
            crawlFrequency: selectedCrawlFrequency,
          },
          type: "url",
          provider: "webcrawler",
          connectionId: undefined,
          name: dataSourceName,
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
        )}/managed/update`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connectorParams: {
              url: dataSourceUrl,
              maxPages: maxPages || WEBCRAWLER_MAX_PAGES,
              depth: maxDepth,
              crawlMode: crawlMode,
              crawlFrequency: selectedCrawlFrequency,
            },
          } satisfies t.TypeOf<typeof UpdateConnectorRequestBodySchema>),
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
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title="Add a Website"
          onSave={isValid && isEdited && !isSaving ? handleCreate : undefined}
          onCancel={() => {
            void router.push(
              `/w/${owner.sId}/builder/data-sources/public-urls`
            );
          }}
        />
      }
      hideSidebar={true}
    >
      <div className="py-8">
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
              showErrorLabel
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
          {webCrawlerConfiguration && (
            <div className="flex">
              <DropdownMenu>
                <DropdownMenu.Button>
                  <Button
                    variant="secondaryWarning"
                    icon={TrashIcon}
                    label={"Delete this Website"}
                  />
                </DropdownMenu.Button>
                <DropdownMenu.Items width={280}>
                  <div className="flex flex-col gap-y-4 px-4 py-4">
                    <div className="flex flex-col gap-y-2">
                      <div className="grow text-sm font-medium text-element-800">
                        Are you sure you want to delete?
                      </div>

                      <div className="text-sm font-normal text-element-700">
                        This will delete the Website for everyone.
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <Button
                        variant="primaryWarning"
                        size="sm"
                        label={"Delete for Everyone"}
                        disabled={false}
                        icon={TrashIcon}
                        onClick={async () => {
                          // setIsSavingOrDeleting(true);
                          await handleDelete();
                          // setIsSavingOrDeleting(false);
                        }}
                      />
                    </div>
                  </div>
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>
          )}
        </Page.Layout>
      </div>
    </AppLayout>
  );
}
