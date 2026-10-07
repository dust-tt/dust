import { AdvancedSettingsSection } from "@app/components/spaces/websites/AdvancedSettingsSection";
import type {
  CrawlingFrequency,
  DepthOption,
  WebCrawlerConfigurationType,
} from "@app/types/connectors/webcrawler";
import {
  CrawlingFrequencies,
  DepthOptions,
  WEBCRAWLER_MAX_PAGES,
} from "@app/types/connectors/webcrawler";
import type { LightWorkspaceType } from "@app/types/user";
import type { WebsiteFormAction, WebsiteFormState } from "@app/types/website";
import {
  AlertCircle,
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  InfoCircle,
  Input,
  Label,
  Page,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

const FREQUENCY_LABELS: Record<CrawlingFrequency, MessageDescriptor> = {
  never: msg({ message: "Never", context: "website refresh schedule" }),
  daily: msg`Every day`,
  weekly: msg`Every week`,
  monthly: msg`Every month`,
};

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
  const { t } = useLingui();

  const getDepthLabel = (depth: DepthOption) =>
    t`${plural(depth, { one: "# level", other: "# levels" })}`;

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
        <Page.H variant="h3">
          <Trans>Website entry point</Trans>
        </Page.H>
        <Label className="pl-1">
          <Trans>Enter the address of the website you'd like to index.</Trans>
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
          title={t`Ensure the website is public`}
          icon={InfoCircle}
          variant="golden"
        >
          <Trans>
            Only public websites accessible without authentication will work.
          </Trans>
        </ContentMessage>
      </Page.Layout>
      <Page.Layout direction="vertical" gap="md">
        <Page.H variant="h3">
          <Trans>Indexing settings</Trans>
        </Page.H>
        <Page.P>
          <Trans>
            Adjust the settings to only index the data you are interested in.
          </Trans>
        </Page.P>
      </Page.Layout>
      <div className="mr-1 grid grid-cols-2 gap-x-6 gap-y-8">
        <Page.Layout direction="vertical" sizing="grow">
          <Page.SectionHeader
            title={t`Crawling strategy`}
            description={t`Do you want to limit to child pages or not?`}
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
              label={t`Only child pages of the provided URL`}
              id="child-pages"
            />
            <RadioGroupItem
              value="website"
              className="gap-2 text-sm"
              label={t`Follow all the links within the domain`}
              id="all-pages"
            />
          </RadioGroup>
        </Page.Layout>
        <Page.Layout direction="vertical" sizing="grow">
          <Page.SectionHeader
            title={t`Refresh schedule`}
            description={t`How often would you like to check for updates?`}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                label={t(FREQUENCY_LABELS[state.crawlFrequency])}
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
                    label={t(FREQUENCY_LABELS[frequency])}
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
            title={t`Depth of search`}
            description={t`How far from the initial page would you like to go?`}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                label={getDepthLabel(state.depth)}
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup>
                {DepthOptions.map((depthOption) => (
                  <DropdownMenuRadioItem
                    key={depthOption}
                    value={depthOption.toString()}
                    label={getDepthLabel(depthOption)}
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
            title={t`Page limit`}
            description={t`What is the maximum number of pages you'd like to index?`}
          />
          <Input
            placeholder={WEBCRAWLER_MAX_PAGES.toString()}
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
                ? t`Maximum pages must be between 1 and ${WEBCRAWLER_MAX_PAGES}`
                : undefined
            }
            messageStatus="error"
            name="maxPages"
          />
        </Page.Layout>
      </div>
      <Page.Layout direction="vertical" gap="md">
        <Page.H variant="h3">
          <Trans>Name</Trans>
        </Page.H>
        {webCrawlerConfiguration ? (
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <AlertCircle />
            <Trans>Website name cannot be changed.</Trans>
          </p>
        ) : (
          <Label className="pl-1">
            <Trans>Give a name to this data source.</Trans>
          </Label>
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
          placeholder={t`Articles`}
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
