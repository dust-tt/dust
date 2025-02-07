import {
  Button,
  Collapsible,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  ExclamationCircleIcon,
  InformationCircleIcon,
  Input,
  Label,
  Page,
  RadioGroup,
  RadioGroupItem,
  Separator,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  TrashIcon,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  APIError,
  CrawlingFrequency,
  DataSourceViewType,
  DepthOption,
  SpaceType,
  UpdateConnectorConfigurationType,
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
  WebCrawlerHeaderRedactedValue,
} from "@dust-tt/types";
import { validateUrl } from "@dust-tt/types/src/shared/utils/url_utils";
import type * as t from "io-ts";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import { useDataSourceViewConnectorConfiguration } from "@app/lib/swr/data_source_views";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import { urlToDataSourceName } from "@app/lib/webcrawler";
import type { PostDataSourceWithProviderRequestBodySchema } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";

const WEBSITE_CAT = "website";

interface SpaceWebsiteModalProps {
  dataSourceView: DataSourceViewType | null;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  space: SpaceType;
  canWriteInSpace: boolean;
}

// todo(GROUPS_INFRA): current component has been mostly copy pasted from the WebsiteConfiguration existing component
// this should be refactored to use the new design.
export default function SpaceWebsiteModal({
  dataSourceView,
  isOpen,

  onClose,
  owner,
  space,
  canWriteInSpace,
}: SpaceWebsiteModalProps) {
  const router = useRouter();
  const sendNotification = useSendNotification();

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
  }, [dataSourceView, webCrawlerConfiguration]);

  const {
    spaceDataSourceViews,
    mutateRegardlessOfQueryParams: mutateSpaceDataSourceViews,
  } = useSpaceDataSourceViews({
    workspaceId: owner.sId,
    spaceId: space.sId,
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
    const validatedUrl = validateUrl(url);
    if (validatedUrl.valid && !dataSourceView) {
      setDataSourceName(urlToDataSourceName(url));
    }
  };

  const validateForm = useCallback(() => {
    let urlError = null;
    let nameError = null;

    // Validate URL
    const validatedUrl = validateUrl(dataSourceUrl);
    if (!validatedUrl.valid) {
      urlError =
        "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c)).";
    }
    // Validate Name (if it's not edition)
    if (!webCrawlerConfiguration) {
      const dataSourceNameRes = isDataSourceNameValid(dataSourceName);
      if (!dataSourceName.length) {
        nameError = "Please provide a name.";
      } else if (dataSourceNameRes.isErr()) {
        nameError = dataSourceNameRes.error;
      } else {
        const nameExists = spaceDataSourceViews.some(
          (view) =>
            view.dataSource.name.toLowerCase() ===
              dataSourceName.toLowerCase() && view.sId !== dataSourceView?.sId
        );
        if (nameExists) {
          nameError = "A website with this name already exists";
        }
      }
    }

    setDataSourceUrlError(urlError);
    setDataSourceNameError(nameError);
    return !urlError && !nameError;
  }, [
    dataSourceUrl,
    webCrawlerConfiguration,
    dataSourceName,
    spaceDataSourceViews,
    dataSourceView?.sId,
  ]);

  useEffect(() => {
    if (isSubmitted) {
      validateForm();
    }
  }, [dataSourceName, dataSourceUrl, isSubmitted, validateForm]);

  const handleCreate = async () => {
    setIsSubmitted(true);
    const validatedUrl = validateUrl(dataSourceUrl.trim());
    if (!validateForm() || !validatedUrl.valid) {
      return;
    }

    setIsSaving(true);
    const sanitizedDataSourceUrl = validatedUrl.standardized;
    const res = await fetch(
      `/api/w/${owner.sId}/spaces/${space.sId}/data_sources`,
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

    const validatedUrl = validateUrl(dataSourceUrl.trim());
    if (!validateForm || !dataSourceView || !validatedUrl.valid) {
      return;
    }

    setIsSaving(true);
    const res = await fetch(
      `/api/w/${owner.sId}/spaces/${space.sId}/data_sources/${dataSourceView.dataSource.sId}/configuration`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          configuration: {
            url: validatedUrl.standardized,
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
      void mutateSpaceDataSourceViews();
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
      `/api/w/${owner.sId}/spaces/${space.sId}/data_sources/${dataSourceView.dataSource.sId}`,
      {
        method: "DELETE",
      }
    );
    setIsSaving(false);
    if (res.ok) {
      void mutateSpaceDataSourceViews();
      await router.push(
        `/w/${owner.sId}/spaces/${space.sId}/categories/${WEBSITE_CAT}`
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
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            {dataSourceView
              ? `Edit ${dataSourceView.dataSource.name}`
              : "Create a website"}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="w-full pt-6">
            <div className="overflow-x-auto px-1">
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
                        message={dataSourceUrlError}
                        messageStatus="error"
                        name="dataSourceUrl"
                      />
                      <ContentMessage
                        title="Ensure the website is public"
                        icon={InformationCircleIcon}
                        variant="pink"
                      >
                        Only public websites accessible without authentication
                        will work.
                      </ContentMessage>
                    </Page.Layout>

                    <Page.Layout direction="vertical" gap="md">
                      <Page.H variant="h3">Indexing settings</Page.H>
                      <Page.P>
                        Adjust the settings in order to only index the data you
                        are interested in.
                      </Page.P>
                    </Page.Layout>
                    <div className="mr-1 grid grid-cols-2 gap-x-6 gap-y-8">
                      <Page.Layout direction="vertical" sizing="grow">
                        <Page.SectionHeader
                          title="Crawling strategy"
                          description="Do you want to limit to child pages or not?"
                        />
                        <RadioGroup
                          value={crawlMode}
                          onValueChange={(value) => {
                            setCrawlMode(
                              value === "child" ? "child" : "website"
                            );
                          }}
                          className="flex flex-col gap-1"
                        >
                          <RadioGroupItem
                            value="child"
                            className="gap-2"
                            label="Only child pages of the provided URL"
                            id="child-pages"
                          />
                          <RadioGroupItem
                            value="website"
                            iconPosition="center"
                            className="gap-2 text-sm"
                            label="Follow all the links within the domain"
                            id="all-pages"
                          />
                        </RadioGroup>
                      </Page.Layout>
                      <Page.Layout direction="vertical" sizing="grow">
                        <Page.SectionHeader
                          title="Refresh schedule"
                          description="How often would you like to check for updates?"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              label={
                                frequencyDisplayText[selectedCrawlFrequency]
                              }
                              isSelect
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuRadioGroup>
                              {CrawlingFrequencies.map((frequency) => {
                                return (
                                  <DropdownMenuRadioItem
                                    key={frequency}
                                    value={frequency}
                                    label={frequencyDisplayText[frequency]}
                                    onClick={() => {
                                      setSelectedCrawlFrequency(frequency);
                                    }}
                                  />
                                );
                              })}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Page.Layout>
                      <Page.Layout direction="vertical" sizing="grow">
                        <Page.SectionHeader
                          title="Depth of Search"
                          description="How far from the initial page would you like to go?"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              label={depthDisplayText[maxDepth]}
                              isSelect
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuRadioGroup>
                              {DepthOptions.map((depthOption) => {
                                return (
                                  <DropdownMenuRadioItem
                                    key={depthOption}
                                    value={depthOption.toString()}
                                    label={depthDisplayText[depthOption]}
                                    onClick={() => {
                                      setMaxDepth(depthOption);
                                    }}
                                  />
                                );
                              })}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                          message={
                            (maxPages && maxPages > WEBCRAWLER_MAX_PAGES) ||
                            (maxPages && maxPages < 1)
                              ? `Maximum pages must be between 1 and ${WEBCRAWLER_MAX_PAGES}`
                              : null
                          }
                          messageStatus="error"
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
                          <ExclamationCircleIcon />
                          Website name cannot be changed.
                        </p>
                      )}
                      <Input
                        value={dataSourceName}
                        onChange={(e) => setDataSourceName(e.target.value)}
                        message={dataSourceNameError}
                        messageStatus="error"
                        name="dataSourceName"
                        placeholder="Articles"
                        disabled={webCrawlerConfiguration !== null}
                      />
                    </Page.Layout>

                    <div className="flex flex-col gap-6">
                      {webCrawlerConfiguration && dataSourceView && (
                        <div className="flex justify-end">
                          <Button
                            variant="warning"
                            icon={TrashIcon}
                            label={"Delete this website"}
                            onClick={() => {
                              setIsDeleteModalOpen(true);
                            }}
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
                        </div>
                      )}
                      <Separator />
                      <AdvancedSettingsSection
                        headers={headers}
                        onSave={setHeaders}
                      />
                    </div>
                  </Page.Layout>
                )}
              </div>
            </div>
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Save",
            onClick: () => {
              setIsSubmitted(true);
              if (!isSaving) {
                if (dataSourceView) {
                  void handleUpdate();
                } else {
                  void handleCreate();
                }
              }
            },
            disabled: !canWriteInSpace,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

const AdvancedSettingsSection = ({
  headers,
  onSave,
}: {
  headers: Array<{ key: string; value: string }>;
  onSave: (headers: Array<{ key: string; value: string }>) => void;
}) => {
  return (
    <Collapsible>
      <Collapsible.Button label="Advanced settings" variant="secondary" />
      <Collapsible.Panel>
        <div className="flex w-full flex-col gap-3">
          <Label>Custom Headers</Label>
          <p>Add custom request headers for the web crawler.</p>
          <div className="flex flex-col gap-4">
            {headers.map((header, index) => (
              <div key={index} className="flex gap-2">
                <div className="flex grow flex-col gap-1 px-1">
                  <Input
                    placeholder="Header Name"
                    value={header.key}
                    name="headerName"
                    onChange={(e) => {
                      const newHeaders = [...headers];
                      newHeaders[index].key = e.target.value;
                      onSave(newHeaders);
                    }}
                    disabled={header.value === WebCrawlerHeaderRedactedValue}
                    className="grow"
                  />
                  <Input
                    name="headerValue"
                    placeholder="Header Value"
                    value={header.value}
                    onChange={(e) => {
                      const newHeaders = [...headers];
                      newHeaders[index].value = e.target.value;
                      onSave(newHeaders);
                    }}
                    disabled={header.value === WebCrawlerHeaderRedactedValue}
                    className="flex-1"
                  />
                </div>
                <Button
                  variant="outline"
                  icon={XMarkIcon}
                  onClick={() => {
                    const newHeaders = headers.filter((_, i) => i !== index);
                    onSave(newHeaders);
                  }}
                />
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            label="Add Header"
            onClick={() => {
              onSave([...headers, { key: "", value: "" }]);
            }}
          />
        </div>
      </Collapsible.Panel>
    </Collapsible>
  );
};
