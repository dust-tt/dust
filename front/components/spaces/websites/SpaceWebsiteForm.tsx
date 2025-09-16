import {
  Button,
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
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

import { AdvancedSettingsSection } from "@app/components/spaces/websites/AdvancedSettingsSection";
import type {
  LightWorkspaceType,
  WebCrawlerConfigurationType,
  WebsiteFormAction,
  WebsiteFormState,
} from "@app/types";
import {
  CrawlingFrequencies,
  DEPTH_DISPLAY_TEXT,
  DepthOptions,
  FREQUENCY_DISPLAY_TEXT,
  WEBCRAWLER_MAX_PAGES,
} from "@app/types";

type SpaceWebsiteFormProps = {
  state: WebsiteFormState;
  dispatch: React.Dispatch<WebsiteFormAction>;
  isConfigurationLoading: boolean;
  webCrawlerConfiguration: WebCrawlerConfigurationType | null;
  owner: LightWorkspaceType;
};

export function SpaceWebsiteForm({
  state,
  dispatch,
  isConfigurationLoading,
  webCrawlerConfiguration,
  owner,
}: SpaceWebsiteFormProps) {
  const handleHeadersChange = useCallback(
    (newHeaders: WebsiteFormState["headers"]) => {
      dispatch({
        type: "SET_FIELD",
        field: "headers",
        value: newHeaders,
      });
    },
    [dispatch]
  );

  return isConfigurationLoading ? (
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
          value={state.url}
          onChange={(e) =>
            dispatch({ type: "SET_FIELD", field: "url", value: e.target.value })
          }
          message={state.errors?.url}
          messageStatus="error"
          name="dataSourceUrl"
        />
        <ContentMessage
          title="Ensure the website is public"
          icon={InformationCircleIcon}
          variant="golden"
        >
          Only public websites accessible without authentication will work.
        </ContentMessage>
      </Page.Layout>
      <Page.Layout direction="vertical" gap="md">
        <Page.H variant="h3">Indexing settings</Page.H>
        <Page.P>
          Adjust the settings to only index the data you are interested in.
        </Page.P>
      </Page.Layout>
      <div className="mr-1 grid grid-cols-2 gap-x-6 gap-y-8">
        <Page.Layout direction="vertical" sizing="grow">
          <Page.SectionHeader
            title="Crawling strategy"
            description="Do you want to limit to child pages or not?"
          />
          <RadioGroup
            value={state.crawlMode}
            onValueChange={(value) =>
              dispatch({
                type: "SET_FIELD",
                field: "crawlMode",
                value: value === "child" ? "child" : "website",
              })
            }
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
                label={FREQUENCY_DISPLAY_TEXT[state.crawlFrequency]}
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup>
                {CrawlingFrequencies.filter(
                  (freq) =>
                    state.crawlFrequency === "daily" ? true : freq !== "daily" // Only display the 'daily' option if the crawler has it
                ).map((frequency) => (
                  <DropdownMenuRadioItem
                    key={frequency}
                    value={frequency}
                    label={FREQUENCY_DISPLAY_TEXT[frequency]}
                    disabled={frequency === "daily"}
                    onClick={() =>
                      dispatch({
                        type: "SET_FIELD",
                        field: "crawlFrequency",
                        value: frequency,
                      })
                    }
                  />
                ))}
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
                label={DEPTH_DISPLAY_TEXT[state.depth]}
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup>
                {DepthOptions.map((depthOption) => (
                  <DropdownMenuRadioItem
                    key={depthOption}
                    value={depthOption.toString()}
                    label={DEPTH_DISPLAY_TEXT[depthOption]}
                    onClick={() =>
                      dispatch({
                        type: "SET_FIELD",
                        field: "depth",
                        value: depthOption,
                      })
                    }
                  />
                ))}
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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            value={state.maxPages?.toString() || ""}
            onChange={(e) => {
              const parsed = parseInt(e.target.value);
              dispatch({
                type: "SET_FIELD",
                field: "maxPages",
                value: !isNaN(parsed)
                  ? parsed
                  : e.target.value === ""
                    ? null
                    : state.maxPages,
              });
            }}
            message={
              state.maxPages &&
              (state.maxPages > WEBCRAWLER_MAX_PAGES || state.maxPages < 1)
                ? `Maximum pages must be between 1 and ${WEBCRAWLER_MAX_PAGES}`
                : undefined
            }
            messageStatus="error"
            name="maxPages"
          />
        </Page.Layout>
      </div>
      <Page.Layout direction="vertical" gap="md">
        <Page.H variant="h3">Name</Page.H>
        {webCrawlerConfiguration ? (
          <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
            <ExclamationCircleIcon />
            Website name cannot be changed.
          </p>
        ) : (
          <Label className="pl-1">Give a name to this Data Source.</Label>
        )}
        <Input
          value={state.name}
          onChange={(e) =>
            dispatch({
              type: "SET_FIELD",
              field: "name",
              value: e.target.value,
            })
          }
          message={state.errors?.name}
          messageStatus="error"
          name="dataSourceName"
          placeholder="Articles"
          disabled={webCrawlerConfiguration !== null}
        />
      </Page.Layout>
      <AdvancedSettingsSection
        headers={state.headers}
        onHeadersChange={handleHeadersChange}
        owner={owner}
      />
    </Page.Layout>
  );
}
